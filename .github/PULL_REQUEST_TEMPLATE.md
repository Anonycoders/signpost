<!--
Thanks for publishing. Delete whichever section does not apply — a content PR
does not need the code checklist, and vice versa.
-->

## What changes

<!-- One line. "Kubernetes 1.31 rollout dates moved to October", not "update file". -->

---

### Content change

- [ ] The dates in `timeline:` match what is actually planned
- [ ] `status:` is where this streamline is **today**
- [ ] Any new update has an honest `impact:` — `breaking` only if things break
- [ ] If the change lands later than today, the update has an `effective:` date
- [ ] Anyone affected can tell from the update **what to do and by when**

<!--
Announcing something that lands on other teams? Say who, here, so a reviewer
can sanity-check the notice period:

Affects: every team deploying to a shared cluster
Lands:   1 October 2026
Notice:  3 weeks
-->

### Code change

- [ ] `npm run check` and `npm run test` pass
- [ ] Anything that changes a validator message has a test asserting the new
      wording — those messages are the product
- [ ] Checked in both light and dark themes

---

<!--
CI runs the content validator first, so if something is wrong with a file it
will tell you which field and what to do. You do not need to run anything
locally to open this.
-->
