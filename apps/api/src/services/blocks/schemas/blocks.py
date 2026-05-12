from typing import Literal

from src.db.strict_base_model import PydanticStrictBaseModel

BlockType = Literal["videoBlock", "pdfBlock", "imageBlock"]


class Block(PydanticStrictBaseModel):
    block_id: str
    activity_id: int
    course_id: int
    block_type: BlockType
