BASE = {
    "date": "2026-11-01",
    "process_group": "Thickening",
    "technology": "Gravity thickener",
    "initial_mass_kg": 1000,
    "initial_moisture_pct": 94,
    "final_moisture_pct": 90,
}


def create_run(client, **overrides):
    response = client.post("/api/handling", json={**BASE, **overrides})
    assert response.status_code == 201
    return response.json()


def user_ids(client):
    return [row["id"] for row in client.get("/api/handling?source=user").json()]


def test_handling_runs_are_ordered_by_stage_then_date_then_id(client):
    drying_latest = create_run(client, date="2026-11-12", process_group="Drying", technology="Solar drying",
                               initial_moisture_pct=70, final_moisture_pct=20)
    thickening_old = create_run(client, date="2026-10-18", process_group="Thickening", technology="Mechanical thickening")
    dewatering_latest = create_run(client, date="2026-11-01", process_group="Dewatering", technology="Filter press",
                                   initial_moisture_pct=91, final_moisture_pct=70)
    thickening_latest = create_run(client, date="2026-10-21", process_group="Thickening", technology="Dissolved air flotation")
    drying_old = create_run(client, date="2026-11-05", process_group="Drying", technology="Thermal drying",
                            initial_moisture_pct=70, final_moisture_pct=10)
    dewatering_old = create_run(client, date="2026-10-29", process_group="Dewatering", technology="Centrifuge",
                                initial_moisture_pct=91, final_moisture_pct=74)

    expected = [
        thickening_latest["id"], thickening_old["id"],
        dewatering_latest["id"], dewatering_old["id"],
        drying_latest["id"], drying_old["id"],
    ]
    assert user_ids(client) == expected

    snapshot = client.get("/api/reports/data").json()["handling"]
    assert [row["id"] for row in snapshot if row["source"] == "user"] == expected


def test_same_date_handling_runs_use_stable_id_descending_order(client):
    first = create_run(client, date="2026-11-01")
    second = create_run(client, date="2026-11-01", technology="Mechanical thickening")
    dewatering = create_run(client, date="2026-11-01", process_group="Dewatering", technology="Filter press",
                            initial_moisture_pct=91, final_moisture_pct=70)
    drying = create_run(client, date="2026-11-01", process_group="Drying", technology="Solar drying",
                        initial_moisture_pct=70, final_moisture_pct=20)

    assert user_ids(client) == [second["id"], first["id"], dewatering["id"], drying["id"]]


def test_handling_order_updates_after_patch_without_changing_ids(client):
    thickening = create_run(client, date="2026-10-18")
    dewatering = create_run(client, date="2026-11-01", process_group="Dewatering", technology="Filter press",
                            initial_moisture_pct=91, final_moisture_pct=70)
    drying = create_run(client, date="2026-11-05", process_group="Drying", technology="Solar drying",
                        initial_moisture_pct=70, final_moisture_pct=20)

    patched = client.patch(f"/api/handling/{thickening['id']}", json={
        "date": "2026-11-20",
        "process_group": "Drying",
    })
    assert patched.status_code == 200
    assert patched.json()["id"] == thickening["id"]

    assert user_ids(client) == [dewatering["id"], thickening["id"], drying["id"]]
