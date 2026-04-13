import logging
from datetime import datetime

from fastapi import HTTPException, Request, status
from sqlmodel import Session, select
from ulid import ULID

from src.db.courses.activities import Activity
from src.db.courses.courses import Course
from src.db.gamification import XPSource
from src.db.trail_runs import TrailRun, TrailRunRead
from src.db.trail_steps import TrailStep, TrailStepRead
from src.db.trails import Trail, TrailCreate, TrailRead
from src.db.users import AnonymousUser, PublicUser
from src.services.courses.certifications import (
    check_course_completion_and_create_certificate,
)
from src.services.gamification import service as gamification_service

logger = logging.getLogger(__name__)


def _hydrate_trail(trail: Trail, user_id: int, db_session: Session) -> TrailRead:
    """Build a hydrated TrailRead with runs, steps, and course metadata.

    Centralizes repeated query logic used across endpoints, avoiding divergence.
    """
    # Fetch runs for this trail/user
    runs_stmt = select(TrailRun).where(
        TrailRun.trail_id == trail.id, TrailRun.user_id == user_id
    )
    runs = db_session.exec(runs_stmt).all()

    run_reads: list[TrailRunRead] = [
        TrailRunRead(**tr.model_dump(), course={}, steps=[], course_total_steps=0)
        for tr in runs
    ]

    if not run_reads:
        return TrailRead(**trail.model_dump(), runs=run_reads)

    run_ids = [rr.id for rr in run_reads if rr.id is not None]
    course_ids = list({rr.course_id for rr in run_reads if rr.course_id})

    # Batch fetch all steps, courses, and chapter activity counts in 3 queries
    all_steps = db_session.exec(
        select(TrailStep).where(
            TrailStep.trailrun_id.in_(run_ids),
            TrailStep.user_id == user_id,
        )
    ).all()
    steps_by_run: dict[int, list[TrailStep]] = {}
    for s in all_steps:
        steps_by_run.setdefault(s.trailrun_id, []).append(s)

    courses_by_id = {
        c.id: c
        for c in db_session.exec(select(Course).where(Course.id.in_(course_ids))).all()
    }

    chapter_act_count: dict[int, int] = {}
    for a in db_session.exec(
        select(Activity).where(Activity.course_id.in_(course_ids))
    ).all():
        if a.course_id is not None:
            chapter_act_count[a.course_id] = chapter_act_count.get(a.course_id, 0) + 1

    # Hydrate each run with steps and course data
    for rr in run_reads:
        steps = steps_by_run.get(rr.id, [])
        rr.steps = [TrailStepRead(**s.model_dump()) for s in steps]

        course_obj = courses_by_id.get(rr.course_id)
        rr.course = course_obj.model_dump() if course_obj else {}
        rr.course_total_steps = chapter_act_count.get(rr.course_id, 0)

        # Embed course per step for convenience
        for s in rr.steps:
            if s.course_id:
                s.data = {"course": courses_by_id.get(s.course_id)}

    return TrailRead(**trail.model_dump(), runs=run_reads)


async def create_user_trail(
    request: Request,
    user: PublicUser,
    trail_object: TrailCreate,
    db_session: Session,
):
    statement = select(Trail).where(Trail.user_id == user.id)
    trail = db_session.exec(statement).first()

    if trail:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trail already exists",
        )

    trail = Trail.model_validate(trail_object.model_dump())

    trail.creation_date = str(datetime.now())
    trail.update_date = str(datetime.now())
    trail.trail_uuid = f"trail_{ULID()}"

    # create trail
    db_session.add(trail)
    db_session.commit()
    db_session.refresh(trail)

    return trail


async def get_user_trails(
    request: Request,
    user: PublicUser,
    db_session: Session,
) -> TrailRead:
    statement = select(Trail).where(Trail.user_id == user.id)
    trail = db_session.exec(statement).first()

    if not trail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Trail not found"
        )

    return _hydrate_trail(trail, user.id, db_session)


async def check_trail_presence(
    user_id: int,
    request: Request,
    user: PublicUser,
    db_session: Session,
):
    statement = select(Trail).where(Trail.user_id == user_id)
    trail = db_session.exec(statement).first()

    if not trail:
        return await create_user_trail(
            request,
            user,
            TrailCreate(
                user_id=user.id,
            ),
            db_session,
        )

    return trail


async def add_activity_to_trail(
    request: Request,
    user: PublicUser,
    activity_uuid: str,
    db_session: Session,
) -> TrailRead:
    # Look for the activity
    statement = select(Activity).where(Activity.activity_uuid == activity_uuid)
    activity = db_session.exec(statement).first()

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found"
        )

    statement = select(Course).where(Course.id == activity.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course not found"
        )

    trail = await check_trail_presence(
        user_id=user.id,
        request=request,
        user=user,
        db_session=db_session,
    )

    statement = select(TrailRun).where(
        TrailRun.trail_id == trail.id,
        TrailRun.course_id == course.id,
        TrailRun.user_id == user.id,
    )
    trailrun = db_session.exec(statement).first()

    if not trailrun:
        trailrun = TrailRun(
            trail_id=trail.id if trail.id is not None else 0,
            course_id=course.id if course.id is not None else 0,
            user_id=user.id,
            creation_date=str(datetime.now()),
            update_date=str(datetime.now()),
        )
        db_session.add(trailrun)
        db_session.commit()
        db_session.refresh(trailrun)

    statement = select(TrailStep).where(
        TrailStep.trailrun_id == trailrun.id,
        TrailStep.activity_id == activity.id,
        TrailStep.user_id == user.id,
    )
    trailstep = db_session.exec(statement).first()

    if not trailstep:
        trailstep = TrailStep(
            trailrun_id=trailrun.id if trailrun.id is not None else 0,
            activity_id=activity.id if activity.id is not None else 0,
            course_id=course.id if course.id is not None else 0,
            trail_id=trail.id if trail.id is not None else 0,
            complete=True,
            teacher_verified=False,
            grade=0,
            user_id=user.id,
            creation_date=str(datetime.now()),
            update_date=str(datetime.now()),
        )
        db_session.add(trailstep)
        db_session.commit()
        db_session.refresh(trailstep)

        # Award XP + learning streak via domain helper (idempotent)
        try:
            gamification_service.on_activity_completed(
                db=db_session,
                user_id=user.id,
                activity_id=activity.id,
                source_id=str(activity.id),
                idempotency_key=f"activity_{activity.id}_{user.id}",
            )
        except Exception as err:
            logger.warning(
                "Gamification.on_activity_completed failed (user_id=%s, activity_id=%s): %s",
                user.id,
                activity.id,
                err,
            )

    # After ensuring the step exists (created or already present), check if the course is now
    # completed and create a certificate if appropriate. This is idempotent and inexpensive.
    try:
        await check_course_completion_and_create_certificate(
            request, user.id, course.id, db_session
        )
    except Exception as err:
        logger.warning(
            "check_course_completion_and_create_certificate failed (user_id=%s, course_id=%s): %s",
            user.id,
            course.id if course else None,
            err,
        )

    # Rebuild and return updated trail state
    return _hydrate_trail(trail, user.id, db_session)


async def remove_activity_from_trail(
    request: Request,
    user: PublicUser,
    activity_uuid: str,
    db_session: Session,
) -> TrailRead:
    # Look for the activity
    statement = select(Activity).where(Activity.activity_uuid == activity_uuid)
    activity = db_session.exec(statement).first()

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found"
        )

    statement = select(Course).where(Course.id == activity.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course not found"
        )

    statement = select(Trail).where(Trail.user_id == user.id)
    trail = db_session.exec(statement).first()

    if not trail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Trail not found"
        )

    # Delete the trail step for this activity
    statement = select(TrailStep).where(
        TrailStep.activity_id == activity.id,
        TrailStep.user_id == user.id,
        TrailStep.trail_id == trail.id,
    )
    trail_step = db_session.exec(statement).first()

    if trail_step:
        db_session.delete(trail_step)
        db_session.commit()

    # Rebuild and return updated trail
    return _hydrate_trail(trail, user.id, db_session)


async def add_course_to_trail(
    request: Request,
    user: PublicUser,
    course_uuid: str,
    db_session: Session,
) -> TrailRead:
    statement = select(Course).where(Course.course_uuid == course_uuid)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course not found"
        )

    # check if run already exists
    statement = select(TrailRun).where(
        TrailRun.course_id == course.id, TrailRun.user_id == user.id
    )
    trailrun = db_session.exec(statement).first()

    if trailrun:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="TrailRun already exists"
        )

    statement = select(Trail).where(Trail.user_id == user.id)
    trail = db_session.exec(statement).first()

    if not trail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Trail not found"
        )

    statement = select(TrailRun).where(
        TrailRun.trail_id == trail.id,
        TrailRun.course_id == course.id,
        TrailRun.user_id == user.id,
    )
    trail_run = db_session.exec(statement).first()

    if not trail_run:
        trail_run = TrailRun(
            trail_id=trail.id if trail.id is not None else 0,
            course_id=course.id if course.id is not None else 0,
            user_id=user.id,
            creation_date=str(datetime.now()),
            update_date=str(datetime.now()),
        )
        db_session.add(trail_run)
        db_session.commit()
        db_session.refresh(trail_run)

    return _hydrate_trail(trail, user.id, db_session)


async def remove_course_from_trail(
    request: Request,
    user: PublicUser,
    course_uuid: str,
    db_session: Session,
) -> TrailRead:
    statement = select(Course).where(Course.course_uuid == course_uuid)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course not found"
        )

    statement = select(Trail).where(Trail.user_id == user.id)
    trail = db_session.exec(statement).first()

    if not trail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Trail not found"
        )

    statement = select(TrailRun).where(
        TrailRun.trail_id == trail.id,
        TrailRun.course_id == course.id,
        TrailRun.user_id == user.id,
    )
    trail_run = db_session.exec(statement).first()

    if trail_run:
        db_session.delete(trail_run)
        db_session.commit()

    # Delete all trail steps for this course
    statement = select(TrailStep).where(
        TrailStep.course_id == course.id, TrailStep.user_id == user.id
    )
    trail_steps = db_session.exec(statement).all()

    for trail_step in trail_steps:
        db_session.delete(trail_step)
    if trail_steps:
        db_session.commit()

    return _hydrate_trail(trail, user.id, db_session)
