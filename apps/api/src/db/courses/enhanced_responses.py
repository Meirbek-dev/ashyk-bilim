"""
Enhanced response models with permission metadata.

These models extend the base Read models to include permission information
that the frontend can use to determine what actions are available to the user.
"""

from pydantic import Field as PydanticField

from src.db.courses.courses import CourseRead, FullCourseRead
from src.db.strict_base_model import PydanticStrictBaseModel


class CourseReadWithPermissions(CourseRead):
    """
    Course response with permission metadata.

    Extends CourseRead with fields that indicate what actions
    the current user can perform on this course.
    """

    can_update: bool = PydanticField(default=False, description="Whether the user can update this course")
    can_delete: bool = PydanticField(default=False, description="Whether the user can delete this course")
    can_manage_contributors: bool = PydanticField(
        default=False, description="Whether the user can manage course contributors"
    )
    is_owner: bool = PydanticField(default=False, description="Whether the current user is the course owner/author")


class FullCourseReadWithPermissions(FullCourseRead):
    """
    Full course response with permission metadata.

    Extends FullCourseRead with permission information.
    """

    can_update: bool = PydanticField(default=False)
    can_delete: bool = PydanticField(default=False)
    can_manage_contributors: bool = PydanticField(default=False)
    is_owner: bool = PydanticField(default=False)
