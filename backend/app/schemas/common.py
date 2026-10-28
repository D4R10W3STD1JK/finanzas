from decimal import Decimal
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field


def _cents(v: Decimal) -> Decimal:
    return v.quantize(Decimal("0.01"))


# Los importes viajan como cadena en JSON ("1234.56") para no perder precisión,
# siempre con dos decimales ("300" → "300.00").
Money = Annotated[Decimal, Field(max_digits=14, decimal_places=2), AfterValidator(_cents)]
PositiveMoney = Annotated[Decimal, Field(max_digits=14, decimal_places=2, gt=0), AfterValidator(_cents)]
Color = Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")]
Icon = Annotated[str, Field(min_length=1, max_length=50)]


class Schema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
