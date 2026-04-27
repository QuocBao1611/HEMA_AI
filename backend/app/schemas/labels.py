from pydantic import BaseModel, Field


class LabelsUpdateRequest(BaseModel):
    class_names: list[str] = Field(..., min_length=1)
