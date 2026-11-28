"""Request schemas and validation for the SLUDGE SMART API."""

import math
from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


def valid_date_optional(value: Optional[str]) -> Optional[str]:
    return valid_date(value) if value else value


def valid_date(value: str) -> str:
    if not isinstance(value, str) or len(value) != 10 or value[4] != "-" or value[7] != "-":
        raise ValueError("date must be in YYYY-MM-DD format")
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("date must be in YYYY-MM-DD format") from exc
    return value


def finite_number(value: float, minimum: float, maximum: float) -> float:
    number = float(value)
    if not math.isfinite(number) or number < minimum or number > maximum:
        raise ValueError(f"value must be between {minimum} and {maximum}")
    return number


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

    @field_validator("wastewater_m3", "wet_sludge_kg", "moisture_pct", "operating_days")
    @classmethod
    def finite_values(cls, value: float) -> float:
        return finite_number(value, -1e308, 1e308)


class LabIn(BaseModel):
    date: str
    sample_id: str = Field(min_length=1, max_length=64)
    ph: Optional[float] = Field(default=None, ge=0, le=14)
    moisture_pct: Optional[float] = Field(default=None, ge=0, lt=100)
    total_solids_pct: Optional[float] = Field(default=None, ge=0, le=100)
    volatile_solids_pct: Optional[float] = Field(default=None, ge=0, le=100)
    oil_grease_mgkg: Optional[float] = Field(default=None, ge=0)
    cod_mgl: Optional[float] = Field(default=None, ge=0)
    lead_mgkg: Optional[float] = Field(default=None, ge=0)
    chromium_mgkg: Optional[float] = Field(default=None, ge=0)
    cadmium_mgkg: Optional[float] = Field(default=None, ge=0)
    nickel_mgkg: Optional[float] = Field(default=None, ge=0)
    other_contaminants: str = Field(default="", max_length=500)

    @field_validator("date")
    @classmethod
    def check_date(cls, value: str) -> str:
        return valid_date(value)

    @field_validator(
        "ph", "moisture_pct", "total_solids_pct", "volatile_solids_pct",
        "oil_grease_mgkg", "cod_mgl", "lead_mgkg", "chromium_mgkg",
        "cadmium_mgkg", "nickel_mgkg",
    )
    @classmethod
    def finite_values(cls, value: Optional[float]) -> Optional[float]:
        return finite_number(value, -1e308, 1e308) if value is not None else None


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

    @field_validator("initial_mass_kg", "initial_moisture_pct", "final_moisture_pct")
    @classmethod
    def finite_values(cls, value: float) -> float:
        return finite_number(value, -1e308, 1e308)

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

    @field_validator("quantity_kg")
    @classmethod
    def finite_values(cls, value: float) -> float:
        return finite_number(value, -1e308, 1e308)


class CompliancePatch(BaseModel):
    status: Optional[Literal["Compliant", "Action required", "Information missing"]] = None
    area: Optional[str] = Field(default=None, min_length=1, max_length=120)
    requirement: Optional[str] = Field(default=None, min_length=1, max_length=500)
    detail: Optional[str] = Field(default=None, max_length=10000)
    note: Optional[str] = Field(default=None, max_length=10000)
    due_date: Optional[str] = None

    @field_validator("due_date")
    @classmethod
    def check_due_date(cls, value: Optional[str]) -> Optional[str]:
        return valid_date(value) if value else value


class ComplianceCreate(BaseModel):
    area: str = Field(min_length=1, max_length=120)
    requirement: str = Field(min_length=1, max_length=500)
    detail: str = Field(default="", max_length=10000)
    status: Literal["Compliant", "Action required", "Information missing"] = "Information missing"
    due_date: Optional[str] = None
    note: str = Field(default="", max_length=10000)

    @field_validator("due_date")
    @classmethod
    def check_due_date(cls, value: Optional[str]) -> Optional[str]:
        return valid_date(value) if value else value


class ComplianceCheckpointIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    area: str = Field(min_length=1, max_length=120)
    requirement: str = Field(min_length=1, max_length=500)
    current_evidence: str = Field(default="", max_length=10000)
    detail: Optional[str] = Field(default=None, max_length=10000)
    status: Literal["Compliant", "Action required", "Information missing"] = "Information missing"
    due_date: Optional[str] = None
    note: str = Field(default="", max_length=10000)

    @field_validator("due_date")
    @classmethod
    def check_due_date(cls, value: Optional[str]) -> Optional[str]:
        return valid_date(value) if value else value

    def evidence_value(self) -> str:
        if self.current_evidence:
            return self.current_evidence
        return self.detail or ""


class ConsignmentIn(BaseModel):
    date: str
    quantity_kg: float = Field(gt=0)
    authorised_facility: str = Field(min_length=1, max_length=160)
    manifest_number: str = Field(min_length=1, max_length=80)
    transport_mode: str = Field(default='', max_length=80)

    @field_validator("date")
    @classmethod
    def check_date(cls, value: str) -> str:
        return valid_date(value)

    @field_validator("quantity_kg")
    @classmethod
    def finite_values(cls, value: float) -> float:
        return finite_number(value, -1e308, 1e308)


class TechnologySettingsIn(BaseModel):
    weights: dict[str, float]
    scores: dict[str, dict[str, float]]

    @field_validator("weights")
    @classmethod
    def check_weights(cls, value: dict[str, float]) -> dict[str, float]:
        for key, item in value.items():
            if not key or len(key) > 64:
                raise ValueError("invalid criterion key")
            value[key] = finite_number(item, 0, 1000)
        return value

    @field_validator("scores")
    @classmethod
    def check_scores(cls, value: dict[str, dict[str, float]]) -> dict[str, dict[str, float]]:
        for tech_id, criteria in value.items():
            if not tech_id or len(tech_id) > 64:
                raise ValueError("invalid technology key")
            for key, item in criteria.items():
                if not key or len(key) > 64:
                    raise ValueError("invalid criterion key")
                criteria[key] = finite_number(item, 1, 5)
        return value


class GenerationPatch(BaseModel):
    date: Optional[str] = None
    wastewater_m3: Optional[float] = None
    wet_sludge_kg: Optional[float] = None
    moisture_pct: Optional[float] = None
    operating_days: Optional[float] = None


class LabPatch(BaseModel):
    date: Optional[str] = None
    sample_id: Optional[str] = None
    ph: Optional[float] = None
    moisture_pct: Optional[float] = None
    total_solids_pct: Optional[float] = None
    volatile_solids_pct: Optional[float] = None
    oil_grease_mgkg: Optional[float] = None
    cod_mgl: Optional[float] = None
    lead_mgkg: Optional[float] = None
    chromium_mgkg: Optional[float] = None
    cadmium_mgkg: Optional[float] = None
    nickel_mgkg: Optional[float] = None
    other_contaminants: Optional[str] = None


class HandlingPatch(BaseModel):
    date: Optional[str] = None
    process_group: Optional[str] = None
    technology: Optional[str] = None
    initial_mass_kg: Optional[float] = None
    initial_moisture_pct: Optional[float] = None
    final_moisture_pct: Optional[float] = None


class DisposalPatch(BaseModel):
    date: Optional[str] = None
    quantity_kg: Optional[float] = None
    facility: Optional[str] = None
    manifest_no: Optional[str] = None
    transport_mode: Optional[str] = None


RoleName = Literal["administrator", "operator", "laboratory", "ehs_reviewer"]


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class PasswordChangeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=12, max_length=256)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: str


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=12, max_length=256)
    full_name: str = Field(default="", max_length=120)
    email: str = Field(default="", max_length=160)
    roles: list[RoleName] = Field(default_factory=list, min_length=1, max_length=4)


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=120)
    email: Optional[str] = Field(default=None, max_length=160)
    is_active: Optional[bool] = None
    must_change_password: Optional[bool] = None
    roles: Optional[list[RoleName]] = Field(default=None, min_length=1, max_length=4)


class UserOut(BaseModel):
    id: int
    username: str
    full_name: str
    email: str
    is_active: bool
    must_change_password: bool
    roles: list[str]
    created_at: Optional[str] = None
    last_login_at: Optional[str] = None


class UserListOut(BaseModel):
    items: list[UserOut]
    total: int


class AuditListOut(BaseModel):
    items: list[dict]
    total: int
    limit: int
    offset: int
