# Tenancy agreement template distillation

## Reference

- File: `/Users/abdullah.taj/Downloads/Tenancy_Agreement_322AlumRockRoad_Updated_2026.docx`
- SHA-256: `10ab5374c850031f29dfd923de918576678d2b7cf2a2d0fb7474389a3702fa93`
- Size: 16 KB; eight rendered pages; one section.
- Evidence: `reference-render/`, `template-style-evidence.json`, `comments.json`, section/style/heading/image/field/footnote/content-control audits.
- The reference is read-only and remains the content and design authority.

## Page system

- A4 portrait, 8.27 x 11.69 inches; one section; 1-inch margins on all sides.
- No distinct first/odd/even page system. No header. Footer is centred Arial 9 pt and reads `Assured Periodic Tenancy Agreement | Page X of Y` using PAGE and NUMPAGES fields.
- Body has no columns, tables, images, footnotes, endnotes, content controls, or active comments.

## Typography and components

- Typeface: Arial throughout. The browser-free PDF equivalent is Helvetica/Helvetica Bold/Helvetica Oblique.
- Title: Arial Bold 16 pt, uppercase, centred. Subtitle: Arial Bold 12 pt, centred.
- Opening metadata and party labels: Arial 11 pt, centred. Party names: Arial Bold 13 pt, centred.
- Body: Arial 11 pt, generally 4 pt before/after. Introductory consideration is justified with 6 pt before/after.
- Section headings: Arial Bold 12 pt, numbered, 12 pt before and 6 pt after. Source capitalization varies; generated output uses the visible uppercase treatment from the rendered pages.
- Statutory notice: blue single-line box, 11 pt bold label and 10 pt body.
- Property name block: centred 11 pt bold address followed by centred 11 pt italic `(the "Property")`.
- Lettered sublists use the source's lower-alpha numbering with a hanging indent and Arial 11 pt.
- Execution: 12 pt bold heading, separate landlord and tenant signature/witness blocks in 11 pt, followed by a thin rule and 10 pt italic information-sheet acknowledgement.

## Content flow

1. Title/subtitle; agreement date; landlord/tenant party block; consideration; boxed important notice.
2. Sections 1-5: property, periodic term, rent, rent increases, security deposit and deductions.
3. Sections 6-12: pets, access, improvements, utilities, insurance, absences, assignment/subletting.
4. Sections 13-18: damage, maintenance, care/use, non-discrimination, rules, termination/possession grounds.
5. Sections 19-24: PRS database, governing law, severability, amendment, addresses for notice, general provisions.
6. Execution, witnesses, and tenant acknowledgement.

## Slot map

- `landlord.fullName`: party block, notice contact block, landlord signature name, and filename.
- `landlord.address`: rent-payment/contact clauses and notice contact block. Required setting.
- `landlord.phone`: notice contact block. Required setting.
- `landlord.email`: notice contact block; sourced from the owner account.
- `tenant.fullName`: party block, notice contact block, tenant signature name, and filename.
- `tenant.phone`: notice contact block; required tenancy/tenant data.
- `tenant.email`: optional notice contact line when present.
- `property.fullAddress`: centred property block; assembled from address lines, city, postcode, and UK.
- `tenancy.startDateLong`: agreement/commencement date; `tenancy.startDateIso` supplies the filename date.
- `tenancy.rentAmountDisplay`, `tenancy.rentDueDayOrdinal`, `tenancy.depositAmountDisplay`, `tenancy.depositSchemeName`, and `tenancy.depositReference`: financial/deposit clauses.
- Pets/garden payload remains recorded in the input snapshot; the statutory pet-request wording is always present and the permitted-pet description is included when supplied.
- Source-specific fixed relet levy is not a reusable data slot. The generated wording limits recovery to lawful, reasonable re-letting costs rather than hard-coding £1,700 across every tenancy.

## Fidelity gates

- Preserve the 24-section order and the source wording except for dynamic substitutions, corrected paragraph/list breaks, obvious source typo cleanup, and the non-reusable fixed relet levy noted above.
- Keep A4/1-inch geometry, Arial-like hierarchy, boxed statutory notice, running footer, lower-alpha lists, and execution/witness layout recognizably source-derived.
- Allow pagination to differ when fixing the source's run-together clauses; never shrink or overlap text to force eight pages.
- Every output page must be rendered and inspected. Searchable text must include all 24 headings, both names, the address, rent/deposit values, and all signature labels.

## Package inventory

The retained package has 20 parts. Editable content authority is `word/document.xml`; layout authority is `word/styles.xml`, `word/numbering.xml`, `word/footer1.xml`, and `word/settings.xml`. All other parts are preserve-only reference evidence. Key hashes: `document.xml` `410086ae…cb7e`; `styles.xml` `f8f7f6b3…6d80`; `numbering.xml` `ea8cf8e1…6be72`; `footer1.xml` `58fdb506…fa5e`; `settings.xml` `c0a9e9cd…3a30`. The complete path/size/SHA inventory was captured in the task log.
