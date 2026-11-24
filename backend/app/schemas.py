"""Request schemas and validation for the SLUDGE SMART API."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator


def valid_date(value: str) -> str:
    try:
        date.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("date must be in YYYY-MM-DD format") from exc
    return value


class GenerationIn(BaseModel):
    date: str
    wastewater_m3: float = Field(gt=0, le=1_000_000)
    wet_sludge_kg: float = Field(gt=0, le=10_000_000)
    moisture_pct: float = Field(ge=0, lt=100)
    operating_days: float = Field(gt=0, le=31)

    @field_validator("date")
    @classmethod
    def check_date(cls, value: str) -> str:
        return valid_date(value)


class LabIn(BaseModel):
    date: str
    sample_id: str = Field(min_length=1, max_length=64)
    ph: float | None = Field(default=None, ge=0, le=14)
    moisture_pct: float | None = Field(default=None, ge=0, lt=100)
    total_solids_pct: float | None = Field(default=None, ge=0, le=100)
    volatile_solids_pct: float | None = Field(default=None, ge=0, le=100)
    oil_grease_mgkg: float | None = Field(default=None, ge=0)
    cod_mgl: float | None = Field(default=None, ge=0)
    lead_mgkg: float | None = Field(default=None, ge=0)
    chromium_mgkg: float | None = Field(default=None, ge=0)
    cadmium_mgkg: float | None = Field(default=None, ge=0)
    nickel_mgkg: float | None = Field(default=None, ge=0)
    other_contaminants: str = Field(default="", max_length=500)

    @field_validator("date")
    @classmethod
    def check_date(cls, value: str) -> str:
        return valid_date(value)


class HandlingIn(BaseModel):
    date: str
    process_group: str = Field(min_length=1, max_length=64)
    technology: str = Field(min_length=1, max_length=64)
    initial_mass_kg: float = Field(gt=0)
    initial_moisture_pct: float = Field(ge=0, lt=100)
    final_moisture_pct: float = Field(ge=0, lt=100)

    @field_validator("date")
    @classmethod
    def check_date(cls, value: str) -> str:
        return valid_date(value)

    @field_validator("final_moisture_pct")
    @classmethod
    def final_below_initial(cls, value: float, info) -> float:
        initial = info.data.get("initial_moisture_pct")
        if initial is not None and value > initial:
            raise ValueError("final moisture cannot exceed initial moisture")
        return value


class DisposalIn(BaseModel):
    date: str
    quantity_kg: float = Field(gt=0)
    facility: str = Field(min_length=1, max_length=160)
    manifest_no: str = Field(min_length=1, max_length=80)
    transport_mode: str = Field(default='', max_length=80)

    @field_validator("date")
    @classmethod
    def check_date(cls, value: str) -> str:
        return valid_date(value)


class CompliancePatch(BaseModel):
    status: Literal["Compliant", "Action required", "Information missing"] | None = None
    detail: str | None = None
    note: str | None = None
    due_date: str | None = None


class ComplianceCreate(BaseModel):
    area: str = Field(min_length=1, max_length=120)
    requirement: str = Field(min_length=1, max_length=500)
    detail: str = ""
    status: Literal["Compliant", "Action required", "Information missing"] = "Information missing"
    due_date: str | None = None
    note: str = ""


class TechnologySettingsIn(BaseModel):
    weights: dict[str, float]
    scores: dict[str, dict[str, float]]
