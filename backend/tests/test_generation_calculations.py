import math

import pytest


BASE = {
    "date": "2026-11-27",
    "wastewater_m3": 420,
    "wet_sludge_kg": 1120,
    "moisture_pct": 94.2,
    "operating_days": 26,
}


def derived(record):
    dry = record["wet_sludge_kg"] * (100 - record["moisture_pct"]) / 100
    return {
        "dry": dry,
        "rate": dry / record["wastewater_m3"],
        "monthly": record["wet_sludge_kg"] * record["operating_days"],
        "annual": record["wet_sludge_kg"] * record["operating_days"] * 12,
    }


def test_generation_inputs_round_trip_and_derived_values(client):
    created = client.post("/api/generation", json=BASE)
    assert created.status_code == 201
    record_id = created.json()["id"]
    assert created.json()["source"] == "user"

    stored = next(row for row in client.get("/api/generation").json() if row["id"] == record_id)
    for key, value in BASE.items():
        assert math.isclose(stored[key], value) if isinstance(value, float) else stored[key] == value

    values = derived(stored)
    assert math.isclose(values["dry"], 64.96, abs_tol=1e-9)
    assert math.isclose(values["rate"], 64.96 / 420, abs_tol=1e-9)
    assert math.isclose(values["monthly"], 1120 * 26, abs_tol=1e-9)
    assert math.isclose(values["annual"], 1120 * 26 * 12, abs_tol=1e-9)

    patched = client.patch(f"/api/generation/{record_id}", json={"moisture_pct": 90, "operating_days": 30})
    assert patched.status_code == 200
    updated = next(row for row in client.get("/api/generation").json() if row["id"] == record_id)
    assert updated["moisture_pct"] == 90
    assert updated["operating_days"] == 30
    updated_values = derived(updated)
    assert math.isclose(updated_values["dry"], 112, abs_tol=1e-9)
    assert math.isclose(updated_values["monthly"], 1120 * 30, abs_tol=1e-9)
    assert math.isclose(updated_values["annual"], 1120 * 30 * 12, abs_tol=1e-9)


def test_generation_list_latest_record_matches_production_summary_source(client):
    older = client.post("/api/generation", json={**BASE, "date": "2026-11-20"})
    assert older.status_code == 201
    newer = client.post("/api/generation", json={**BASE, "date": "2026-11-27"})
    assert newer.status_code == 201
    newest_tie = client.post("/api/generation", json={**BASE, "date": "2026-11-27", "wet_sludge_kg": 1400})
    assert newest_tie.status_code == 201

    rows = client.get("/api/generation").json()
    assert rows[0]["id"] == newest_tie.json()["id"]
    assert rows[0]["date"] == "2026-11-27"
    assert rows[0]["wet_sludge_kg"] == 1400


@pytest.mark.parametrize("field,value", [
    ("date", ""),
    ("date", "27-11-2026"),
    ("wastewater_m3", ""),
    ("wastewater_m3", 0),
    ("wastewater_m3", -1),
    ("wastewater_m3", "not-a-number"),
    ("wet_sludge_kg", 0),
    ("wet_sludge_kg", -5),
    ("moisture_pct", -1),
    ("moisture_pct", 100),
    ("operating_days", 0),
    ("operating_days", -1),
    ("operating_days", 32),
])
def test_generation_rejects_invalid_inputs(client, field, value):
    response = client.post("/api/generation", json={**BASE, field: value})
    assert response.status_code == 422
