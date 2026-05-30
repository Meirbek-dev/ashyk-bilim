_models_imported = False


def import_orm_models() -> None:
    global _models_imported

    if _models_imported:
        return


    _models_imported = True
