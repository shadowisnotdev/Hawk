import postgres from 'postgres';
import dotenv from 'dotenv';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

dotenv.config();

const SOURCE_URL =
  process.env.SOURCE_DATABASE_URL ||
  process.env.DATABASE_URL ||
  '';

const TARGET_URL = process.env.TARGET_DATABASE_URL || '';
if (!TARGET_URL) throw new Error('TARGET_DATABASE_URL is required');

if (!SOURCE_URL) {
  console.error('ERROR: Missing SOURCE_DATABASE_URL or DATABASE_URL in environment.');
  process.exit(1);
}

function mask(url: string): string {
  return url.replace(/:\/\/[^:]+:([^@]+)@/, '://***:****@');
}

console.log('='.repeat(65));
console.log('  HAWK DATABASE MIGRATION ENGINE');
console.log('='.repeat(65));
console.log(`Source: ${mask(SOURCE_URL)}`);
console.log(`Target: ${mask(TARGET_URL)}`);
console.log('='.repeat(65));

async function main() {
  const isSourceSsl =
    SOURCE_URL.includes('sslmode=require') ||
    SOURCE_URL.includes('neon.tech') ||
    SOURCE_URL.includes('supabase.co');

  const sourceSql = postgres(SOURCE_URL, {
    ssl: isSourceSsl ? 'require' : 'prefer',
    max: 5,
    idle_timeout: 10,
    connect_timeout: 15,
  });

  const targetSql = postgres(TARGET_URL, {
    ssl: false,
    max: 5,
    idle_timeout: 10,
    connect_timeout: 15,
  });

  try {
    // 1. Validate connectivity
    console.log('\n[1/6] Verifying database connectivity...');
    const [sourceVer] = await sourceSql`SELECT version(), current_database() as db`;
    console.log(`  ✓ Source connected: ${sourceVer.db} (${sourceVer.version.slice(0, 30)}...)`);

    const [targetVer] = await targetSql`SELECT version(), current_database() as db`;
    console.log(`  ✓ Target connected: ${targetVer.db} (${targetVer.version.slice(0, 30)}...)`);

    // 2. Run schema migrations on Target
    console.log('\n[2/6] Initializing schema on target database...');
    await targetSql`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    const migrationsDir = join(process.cwd(), 'src', 'core', 'database', 'migrations', 'sql');
    const sqlFiles = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

    const appliedRecords = await targetSql`SELECT filename FROM _migrations`;
    const appliedSet = new Set(appliedRecords.map((r) => r.filename));

    let migrationsApplied = 0;
    for (const file of sqlFiles) {
      if (appliedSet.has(file)) continue;

      const rawSql = await readFile(join(migrationsDir, file), 'utf-8');
      const cleanSql = rawSql.replace(/^\uFEFF/, '').trim();
      if (!cleanSql) continue;

      await targetSql.begin(async (tx) => {
        await tx.unsafe(cleanSql);
        await tx`INSERT INTO _migrations (filename) VALUES (${file}) ON CONFLICT DO NOTHING`;
      });
      migrationsApplied++;
    }

    // Safety columns
    await targetSql`ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS log_channel_id TEXT`.catch(() => {});
    await targetSql`ALTER TABLE afk_users ADD COLUMN IF NOT EXISTS channel_id TEXT, ADD COLUMN IF NOT EXISTS message_id TEXT`.catch(() => {});

    console.log(`  ✓ Schema initialization complete (${migrationsApplied} new migrations applied, ${sqlFiles.length} total).`);

    // 3. Discover tables and foreign key dependencies
    console.log('\n[3/6] Discovering tables and dependencies...');
    const sourceTables = await sourceSql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;

    const allTableNames = sourceTables.map((t) => t.table_name);
    console.log(`  Found ${allTableNames.length} tables on source.`);

    // Ensure all source tables exist on target
    const targetTablesPre = (
      await targetSql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
      `
    ).map((t) => t.table_name);
    const targetTableSet = new Set(targetTablesPre);

    const missingTables = allTableNames.filter((t) => !targetTableSet.has(t));
    if (missingTables.length > 0) {
      console.log(`  Target is missing ${missingTables.length} tables:`, missingTables.join(', '));
      for (const table of missingTables) {
        const cols = await sourceSql`
          SELECT column_name, udt_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ${table}
          ORDER BY ordinal_position
        `;
        const colDefs = cols.map((c) => {
          const isSerial = c.column_default && c.column_default.includes('nextval(');
          let typeStr = c.udt_name;
          if (isSerial) {
            if (c.udt_name === 'int8') typeStr = 'BIGSERIAL';
            else if (c.udt_name === 'int2') typeStr = 'SMALLSERIAL';
            else typeStr = 'SERIAL';
          } else {
            if (c.udt_name === 'int4') typeStr = 'INTEGER';
            else if (c.udt_name === 'int8') typeStr = 'BIGINT';
            else if (c.udt_name === 'int2') typeStr = 'SMALLINT';
            else if (c.udt_name === 'bool') typeStr = 'BOOLEAN';
            else if (c.udt_name === '_text') typeStr = 'TEXT[]';
            else if (c.udt_name === '_varchar') typeStr = 'VARCHAR[]';
            else if (c.udt_name === '_int4') typeStr = 'INTEGER[]';
            else if (c.udt_name === '_int8') typeStr = 'BIGINT[]';
          }

          let def = `"${c.column_name}" ${typeStr}`;
          if (!isSerial && c.column_default) {
            def += ` DEFAULT ${c.column_default}`;
          }
          if (c.is_nullable === 'NO' && !isSerial) {
            def += ` NOT NULL`;
          }
          return def;
        });

        // Check primary keys
        const pks = await sourceSql`
          SELECT kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema = 'public'
            AND tc.table_name = ${table}
        `;
        if (pks.length > 0) {
          const pkCols = pks.map((p) => `"${p.column_name}"`).join(', ');
          colDefs.push(`PRIMARY KEY (${pkCols})`);
        }

        const createStmt = `CREATE TABLE IF NOT EXISTS "${table}" (${colDefs.join(', ')})`;
        console.log(`  Creating table '${table}' on target...`);
        await targetSql.unsafe(createStmt);
      }
    }

    // Ensure all columns on source tables exist on target tables
    console.log('  Checking for schema/column drift across tables...');
    for (const table of allTableNames) {
      const sourceCols = await sourceSql`
        SELECT column_name, udt_name, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table}
      `;
      const targetCols = (
        await targetSql`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ${table}
        `
      ).map((c) => c.column_name);
      const targetColSet = new Set(targetCols);

      for (const col of sourceCols) {
        if (!targetColSet.has(col.column_name)) {
          console.log(`  Adding missing column '${col.column_name}' (${col.udt_name}) to table '${table}'...`);
          let typeStr = col.udt_name;
          if (col.udt_name === 'int4') typeStr = 'INTEGER';
          else if (col.udt_name === 'int8') typeStr = 'BIGINT';
          else if (col.udt_name === 'int2') typeStr = 'SMALLINT';
          else if (col.udt_name === 'bool') typeStr = 'BOOLEAN';
          else if (col.udt_name === '_text') typeStr = 'TEXT[]';
          else if (col.udt_name === '_varchar') typeStr = 'VARCHAR[]';
          else if (col.udt_name === '_int4') typeStr = 'INTEGER[]';
          else if (col.udt_name === '_int8') typeStr = 'BIGINT[]';

          let def = `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${col.column_name}" ${typeStr}`;
          if (col.column_default && !col.column_default.includes('nextval(')) {
            def += ` DEFAULT ${col.column_default}`;
          }
          await targetSql.unsafe(def);
        }
      }
    }

    // Fetch foreign key relationships on target
    const foreignKeys = await targetSql`
      SELECT
        tc.table_name,
        ccu.table_name AS foreign_table_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
    `;

    // Build dependency map: table -> Set of tables that must be inserted before it
    const dependencies = new Map<string, Set<string>>();
    for (const name of allTableNames) {
      dependencies.set(name, new Set());
    }

    for (const fk of foreignKeys) {
      if (
        dependencies.has(fk.table_name) &&
        dependencies.has(fk.foreign_table_name) &&
        fk.table_name !== fk.foreign_table_name
      ) {
        dependencies.get(fk.table_name)!.add(fk.foreign_table_name);
      }
    }

    // Topological sort (Kahn's algorithm)
    const sortedTables: string[] = [];
    const remaining = new Set(allTableNames);

    while (remaining.size > 0) {
      let progressed = false;
      for (const table of remaining) {
        const deps = dependencies.get(table)!;
        const canInsert = Array.from(deps).every((d) => sortedTables.includes(d));
        if (canInsert) {
          sortedTables.push(table);
          remaining.delete(table);
          progressed = true;
        }
      }
      if (!progressed) {
        console.warn('  ⚠️ Note: Appending remaining tables:', Array.from(remaining));
        sortedTables.push(...Array.from(remaining));
        break;
      }
    }

    const confirmation = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await confirmation.question('Type REPLACE TARGET DATABASE to confirm permanent replacement: ');
    confirmation.close();
    if (answer !== 'REPLACE TARGET DATABASE') throw new Error('Transfer cancelled');

    // 4. Truncate all tables at once in cascade
    console.log('\n[4/6] Truncating target tables...');
    const quotedTables = sortedTables.map((t) => `"${t}"`).join(', ');
    await targetSql.unsafe(`TRUNCATE TABLE ${quotedTables} CASCADE`);
    console.log(`  ✓ All ${sortedTables.length} tables truncated cleanly.`);

    // 5. Transfer table data in dependency order
    console.log('\n[5/6] Transferring table data in dependency order...');
    const auditResults: Array<{ table: string; sourceCount: number; targetCount: number; status: string }> = [];

    for (const table of sortedTables) {
      process.stdout.write(`  Transferring '${table}'... `);

      // Read source rows
      const rows = await sourceSql.unsafe(`SELECT * FROM "${table}"`);
      const rowCount = rows.length;

      if (rowCount > 0) {
        // Insert in batches of 250
        const batchSize = 250;
        for (let i = 0; i < rowCount; i += batchSize) {
          const chunk = rows.slice(i, i + batchSize);
          await targetSql`INSERT INTO ${targetSql(table)} ${targetSql(chunk)}`;
        }
      }

      const [targetCountRes] = await targetSql.unsafe(`SELECT COUNT(*)::int as count FROM "${table}"`);
      const targetCount = targetCountRes.count;

      const isMatch = rowCount === targetCount;
      console.log(`${rowCount} rows -> ${targetCount} copied ${isMatch ? '✓' : '✗'}`);

      auditResults.push({
        table,
        sourceCount: rowCount,
        targetCount,
        status: isMatch ? 'MATCH' : 'MISMATCH',
      });
    }

    // 5. Synchronize all Sequence counters
    console.log('\n[5/6] Synchronizing auto-increment sequences...');
    const sequences = await targetSql`
      SELECT c.relname AS sequence_name, t.relname AS table_name, a.attname AS column_name
      FROM pg_class c
      JOIN pg_depend d ON d.objid = c.oid
      JOIN pg_class t ON t.oid = d.refobjid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
      WHERE c.relkind = 'S'
    `;

    for (const seq of sequences) {
      try {
        await targetSql.unsafe(`
          SELECT setval(
            '${seq.sequence_name}',
            COALESCE((SELECT MAX("${seq.column_name}") FROM "${seq.table_name}"), 1)
          )
        `);
      } catch (err: any) {
        console.warn(`  Warning syncing sequence ${seq.sequence_name}:`, err.message);
      }
    }
    console.log(`  ✓ Synchronized ${sequences.length} sequences.`);

    // 6. Final Parity Audit Report
    console.log('\n[6/6] Final Data Parity Audit Report:');
    console.log('-'.repeat(65));
    console.log(
      'Table Name'.padEnd(28) +
      'Source Rows'.padStart(14) +
      'Target Rows'.padStart(14) +
      'Status'.padStart(9)
    );
    console.log('-'.repeat(65));

    let allMatch = true;
    for (const res of auditResults) {
      console.log(
        res.table.padEnd(28) +
        String(res.sourceCount).padStart(14) +
        String(res.targetCount).padStart(14) +
        res.status.padStart(9)
      );
      if (res.status !== 'MATCH') allMatch = false;
    }
    console.log('-'.repeat(65));

    if (allMatch) {
      console.log('\n🎉 SUCCESS: All tables migrated with 100% data parity!');
    } else {
      console.error('\n⚠️ WARNING: Some table row counts do not match. Review audit above.');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Fatal Migration Error:', error);
    process.exit(1);
  } finally {
    await sourceSql.end().catch(() => {});
    await targetSql.end().catch(() => {});
  }
}

main();
