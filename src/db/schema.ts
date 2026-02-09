export const DDL = `
CREATE TABLE IF NOT EXISTS icd10_codes (
  code TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  category TEXT,
  age_min INTEGER,
  age_max INTEGER,
  sex TEXT CHECK(sex IN ('M', 'F', 'B'))
);

CREATE TABLE IF NOT EXISTS hcpcs_codes (
  code TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  category TEXT,
  status TEXT
);

CREATE TABLE IF NOT EXISTS ptp_edits (
  column1 TEXT NOT NULL,
  column2 TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  termination_date TEXT,
  modifier_indicator TEXT CHECK(modifier_indicator IN ('0', '1', '9')) NOT NULL,
  ptp_edit_rationale TEXT,
  PRIMARY KEY (column1, column2, effective_date)
);

CREATE TABLE IF NOT EXISTS mue_edits (
  code TEXT PRIMARY KEY,
  practitioner_mue INTEGER NOT NULL,
  facility_mue INTEGER NOT NULL,
  mue_rationale TEXT
);

CREATE TABLE IF NOT EXISTS addon_codes (
  addon_code TEXT NOT NULL,
  primary_codes TEXT NOT NULL,
  description TEXT,
  PRIMARY KEY (addon_code, primary_codes)
);

CREATE TABLE IF NOT EXISTS sync_metadata (
  dataset TEXT PRIMARY KEY,
  last_sync TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  source TEXT
);

CREATE INDEX IF NOT EXISTS idx_ptp_column1 ON ptp_edits(column1);
CREATE INDEX IF NOT EXISTS idx_ptp_column2 ON ptp_edits(column2);
CREATE INDEX IF NOT EXISTS idx_addon_code ON addon_codes(addon_code);
`;
