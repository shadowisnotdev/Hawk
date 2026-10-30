ALTER TABLE dashboard_otps ALTER COLUMN otp_code TYPE VARCHAR(64);
UPDATE dashboard_otps
SET otp_code = encode(sha256(convert_to(otp_code, 'UTF8')), 'hex')
WHERE otp_code ~ '^[0-9]{6}$';
