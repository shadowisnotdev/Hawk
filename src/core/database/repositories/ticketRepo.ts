import { getDb } from '../pool.js';

export interface TicketPanel {
  id: number;
  guildId: string;
  name: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  buttonLabel: string;
  staffRoleId: string;
  categoryId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TicketRecord {
  id: number;
  guildId: string;
  channelId: string;
  panelId: number | null;
  userId: string;
  ticketNumber: number;
  category: string;
  targetUserId: string | null;
  reason: string;
  status: 'open' | 'closed';
  claimedBy: string | null;
  closedBy: string | null;
  closeReason: string | null;
  createdAt: Date;
  closedAt: Date | null;
}

export async function createTicketPanel(panel: {
  guildId: string;
  name: string;
  title: string;
  description: string;
  thumbnailUrl?: string | null;
  buttonLabel?: string;
  staffRoleId: string;
  categoryId?: string | null;
}): Promise<TicketPanel> {
  const db = getDb();
  const rows = await db`
    INSERT INTO ticket_panels (
      guild_id, name, title, description, thumbnail_url, button_label, staff_role_id, category_id
    ) VALUES (
      ${panel.guildId},
      ${panel.name.toLowerCase()},
      ${panel.title},
      ${panel.description},
      ${panel.thumbnailUrl || null},
      ${panel.buttonLabel || 'Create Ticket'},
      ${panel.staffRoleId},
      ${panel.categoryId || null}
    )
    ON CONFLICT (guild_id, name)
    DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      thumbnail_url = EXCLUDED.thumbnail_url,
      button_label = EXCLUDED.button_label,
      staff_role_id = EXCLUDED.staff_role_id,
      category_id = EXCLUDED.category_id,
      updated_at = NOW()
    RETURNING *
  `;
  return mapPanelRow(rows[0]);
}

export async function getTicketPanel(guildId: string, name: string): Promise<TicketPanel | null> {
  const db = getDb();
  const rows = await db`
    SELECT * FROM ticket_panels
    WHERE guild_id = ${guildId} AND LOWER(name) = ${name.toLowerCase()}
  `;
  if (rows.length === 0) return null;
  return mapPanelRow(rows[0]);
}

export async function getTicketPanelById(id: number): Promise<TicketPanel | null> {
  const db = getDb();
  const rows = await db`SELECT * FROM ticket_panels WHERE id = ${id}`;
  if (rows.length === 0) return null;
  return mapPanelRow(rows[0]);
}

export async function listTicketPanels(guildId: string): Promise<TicketPanel[]> {
  const db = getDb();
  const rows = await db`
    SELECT * FROM ticket_panels
    WHERE guild_id = ${guildId}
    ORDER BY created_at ASC
  `;
  return rows.map(mapPanelRow);
}

export async function deleteTicketPanel(guildId: string, name: string): Promise<boolean> {
  const db = getDb();
  const res = await db`
    DELETE FROM ticket_panels
    WHERE guild_id = ${guildId} AND LOWER(name) = ${name.toLowerCase()}
  `;
  return res.count > 0;
}

export async function getNextTicketNumber(guildId: string): Promise<number> {
  const db = getDb();
  const rows = await db`
    SELECT COALESCE(MAX(ticket_number), 0) + 1 AS next_num
    FROM tickets
    WHERE guild_id = ${guildId}
  `;
  return Number(rows[0]?.next_num ?? 1);
}

export async function createTicket(ticket: {
  guildId: string;
  channelId: string;
  panelId?: number | null;
  userId: string;
  ticketNumber: number;
  category: string;
  targetUserId?: string | null;
  reason: string;
}): Promise<TicketRecord> {
  const db = getDb();
  const rows = await db`
    INSERT INTO tickets (
      guild_id, channel_id, panel_id, user_id, ticket_number, category, target_user_id, reason
    ) VALUES (
      ${ticket.guildId},
      ${ticket.channelId},
      ${ticket.panelId || null},
      ${ticket.userId},
      ${ticket.ticketNumber},
      ${ticket.category},
      ${ticket.targetUserId || null},
      ${ticket.reason}
    )
    RETURNING *
  `;
  return mapTicketRow(rows[0]);
}

export async function getTicketByChannel(channelId: string): Promise<TicketRecord | null> {
  const db = getDb();
  const rows = await db`
    SELECT * FROM tickets
    WHERE channel_id = ${channelId}
  `;
  if (rows.length === 0) return null;
  return mapTicketRow(rows[0]);
}

export async function updateTicketClaim(channelId: string, claimedBy: string): Promise<void> {
  const db = getDb();
  await db`
    UPDATE tickets
    SET claimed_by = ${claimedBy}
    WHERE channel_id = ${channelId}
  `;
}

export async function closeTicket(channelId: string, closedBy: string, reason: string): Promise<void> {
  const db = getDb();
  await db`
    UPDATE tickets
    SET status = 'closed', closed_by = ${closedBy}, close_reason = ${reason}, closed_at = NOW()
    WHERE channel_id = ${channelId}
  `;
}

export async function reopenTicket(channelId: string): Promise<void> {
  const db = getDb();
  await db`
    UPDATE tickets
    SET status = 'open', closed_by = NULL, close_reason = NULL, closed_at = NULL
    WHERE channel_id = ${channelId}
  `;
}

export async function deleteTicket(channelId: string): Promise<void> {
  const db = getDb();
  await db`DELETE FROM tickets WHERE channel_id = ${channelId}`;
}

function mapPanelRow(r: any): TicketPanel {
  return {
    id: r.id,
    guildId: r.guild_id,
    name: r.name,
    title: r.title,
    description: r.description,
    thumbnailUrl: r.thumbnail_url,
    buttonLabel: r.button_label,
    staffRoleId: r.staff_role_id,
    categoryId: r.category_id,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}

function mapTicketRow(r: any): TicketRecord {
  return {
    id: r.id,
    guildId: r.guild_id,
    channelId: r.channel_id,
    panelId: r.panel_id,
    userId: r.user_id,
    ticketNumber: r.ticket_number,
    category: r.category,
    targetUserId: r.target_user_id,
    reason: r.reason,
    status: r.status,
    claimedBy: r.claimed_by,
    closedBy: r.closed_by,
    closeReason: r.close_reason,
    createdAt: new Date(r.created_at),
    closedAt: r.closed_at ? new Date(r.closed_at) : null,
  };
}

