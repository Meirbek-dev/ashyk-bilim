You are performing a strict, production-grade mypy remediation pass.

Goal:

* Fix every mypy error reported in the attached mypy report.
* Improve type safety and code quality.
* Do not introduce hacks, broad ignores, casts, or weaken typing merely to silence mypy.

Requirements:

1. Root-cause driven fixes

   * Understand why each error occurs.
   * Fix the underlying type design rather than applying superficial patches.
   * Prefer correcting model definitions, generics, overloads, discriminated unions, protocols, and type narrowing.

2. Forbidden shortcuts

   * Do NOT use:

     * `# type: ignore`
     * `cast(Any, ...)`
     * `cast(...)` unless absolutely required and justified
     * `Any` as a workaround
     * disabling mypy rules
     * blanket `Optional` additions without semantic justification
   * Remove obsolete ignores when encountered.

3. Type quality standards

   * Add explicit return types to every function that requires them.
   * Replace bare collections:

     * `dict` → `dict[K, V]`
     * `list` → `list[T]`
     * `set` → `set[T]`
     * `Callable` → fully parameterized `Callable[[...], R]`
     * `Awaitable` → `Awaitable[T]`
   * Eliminate implicit Any propagation.
   * Ensure generic parameters are correctly specified.

4. SQLAlchemy / SQLModel fixes

   * Investigate all query-related typing issues.
   * Fix incorrect usage that produces:

     * `int has no attribute in_`
     * `str has no attribute in_`
     * `datetime has no attribute desc`
     * boolean expressions passed into `join`, `where`, `and_`, `or_`
     * invalid `select(...)` arguments
     * invalid `order_by(...)` arguments
   * Verify that actual ORM column expressions are used rather than runtime values.
   * Prefer strongly typed query construction.

5. Union and Optional handling

   * Replace unsafe attribute access on unions with:

     * pattern matching
     * isinstance checks
     * discriminated unions
     * explicit None checks
   * Remove impossible states when domain invariants guarantee existence.
   * Avoid unnecessary Optional propagation.

6. Pydantic / SQLModel models

   * Fix inheritance mismatches properly.
   * Where list covariance issues occur, redesign the model hierarchy rather than suppressing errors.

7. Domain modeling

   * If mypy reveals a flawed domain model:

     * refactor the model
     * introduce dedicated types
     * split overloaded responsibilities
     * improve abstraction boundaries
   * Favor correctness over minimal diff size.

8. Unreachable and redundant code

   * Investigate every:

     * unreachable statement
     * redundant expression
     * impossible branch
   * Remove dead code if safe.
   * If the branch represents a legitimate scenario, redesign the typing so mypy understands it.

9. Third-party libraries

   * For missing stubs:

     * first check whether official stubs or typing support exist
     * add proper type support when appropriate
     * avoid global ignore_missing_imports unless absolutely unavoidable

10. Execution strategy

    * Work category by category:

      1. Missing annotations
      2. Generic parameters
      3. Optional/Union issues
      4. SQLAlchemy typing issues
      5. Model inheritance issues
      6. Query/result typing issues
      7. Remaining edge cases
    * After each category:

      * run mypy
      * verify error count decreases
      * ensure no regressions

11. Validation
    Execute after changes:

    ```bash
    mypy .
    ruff check .
    pytest
    ```

    If tests fail:

    * fix the implementation
    * do not weaken typing

12. Deliverables
    Produce:

    * a summary of each category of fixes
    * architectural problems discovered
    * notable type-safety improvements
    * final mypy error count
    * files modified

Success criteria:

* Zero mypy errors.
* No new lint violations.
* No behavioral regressions.
* Improved type precision compared to the original implementation.
* Code should look as though it was designed with strict typing from the beginning rather than patched afterward.
