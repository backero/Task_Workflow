"""Tests for fkpulse.importer.import_ads_csv (flexible header mapping)."""

import sqlite3
import textwrap

import pytest

from fkpulse.importer import import_ads_csv

SAMPLE_CSV = textwrap.dedent(
    """\
    Campaign,Date,Ad Spend,Direct Revenue
    FSNDEMO0001,2024-06-01,"₹1,250.50",4800
    FSNDEMO0001,02/06/2024,980.25,3010.75
    FSNDEMO0002,06/03/2024,"1,100",2200
    ,2024-06-03,500,1000
    TOTAL,not-a-date,9999,9999
    """
)
# Note: 06/03/2024 is parsed as DD/MM/YYYY -> 2024-03-06 (Indian convention
# is tried first; ambiguous dates should be exported as ISO).


def _read_rows(db_path):
    conn = sqlite3.connect(db_path)
    rows = conn.execute(
        "SELECT fsn, date, spend, sales, source FROM ad_spend ORDER BY id"
    ).fetchall()
    conn.close()
    return rows


def test_import_flexible_headers(tmp_path):
    db = str(tmp_path / "fk_pulse.db")
    csv_path = tmp_path / "ads_report.csv"
    csv_path.write_text(SAMPLE_CSV, encoding="utf-8")

    inserted = import_ads_csv(db, str(csv_path))

    # 3 valid rows; blank-FSN and garbage-date rows are skipped
    assert inserted == 3
    rows = _read_rows(db)
    assert rows == [
        ("FSNDEMO0001", "2024-06-01", 1250.50, 4800.0, "csv"),
        ("FSNDEMO0001", "2024-06-02", 980.25, 3010.75, "csv"),
        ("FSNDEMO0002", "2024-03-06", 1100.0, 2200.0, "csv"),
    ]


def test_import_canonical_headers(tmp_path):
    db = str(tmp_path / "fk_pulse.db")
    csv_path = tmp_path / "ads2.csv"
    csv_path.write_text(
        "FSN,Date,Spend,Sales\nFSNDEMO0003,2024-06-05,120.0,450.0\n",
        encoding="utf-8",
    )

    assert import_ads_csv(db, str(csv_path)) == 1
    assert _read_rows(db) == [
        ("FSNDEMO0003", "2024-06-05", 120.0, 450.0, "csv")
    ]


def test_missing_required_columns_raises(tmp_path):
    db = str(tmp_path / "fk_pulse.db")
    csv_path = tmp_path / "bad.csv"
    csv_path.write_text("Foo,Bar\n1,2\n", encoding="utf-8")

    with pytest.raises(ValueError, match="FSN"):
        import_ads_csv(db, str(csv_path))
