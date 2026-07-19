import type { LeaseV1ViewModel } from "./view-model";

export type LeaseTemplateItem =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] };

export interface LeaseTemplateSection {
  title: string;
  items: LeaseTemplateItem[];
}

const paragraph = (text: string): LeaseTemplateItem => ({ kind: "paragraph", text });
const list = (items: string[]): LeaseTemplateItem => ({ kind: "list", items });

/**
 * Versioned lease/v1 wording, distilled from the supplied assured-periodic
 * tenancy agreement. Dynamic values are already formatted by the view model.
 */
export function buildLeaseSections(viewModel: LeaseV1ViewModel): LeaseTemplateSection[] {
  const { landlord, tenant, tenancy, clauses } = viewModel;

  return [
    {
      title: "1. The Property",
      items: [
        paragraph(
          "1.1  The Landlord is the owner of residential property and is legally entitled to grant this tenancy."
        ),
        paragraph(
          "1.2  The Landlord agrees to let to the Tenant, and the Tenant agrees to take a tenancy of the property known as:"
        ),
        paragraph("1.3  The Property is let for use as residential premises only."),
        paragraph(
          "1.4  No smoking is permitted anywhere on the Property by the Tenant, members of the Tenant's household, or any guests or visitors."
        ),
        paragraph(
          "1.5  The Tenant may keep a pet at the Property subject to the provisions of clause 6 below and the Renters' Rights Act 2025."
        ),
      ],
    },
    {
      title: "2. Term and Nature of Tenancy",
      items: [
        paragraph(
          "2.1  This Agreement creates an Assured Periodic Tenancy (APT) as defined by the Housing Act 1988 (as amended by the Renters' Rights Act 2025). There is no fixed term. The tenancy runs on a month-to-month basis from the start date."
        ),
        paragraph(
          `2.2  The tenancy commences on ${tenancy.startDateLong} (the "Commencement Date").`
        ),
        paragraph(
          "2.3  The tenancy shall continue indefinitely on a monthly basis until terminated in accordance with this Agreement and applicable legislation."
        ),
        paragraph(
          "2.4  The Tenant may end the tenancy at any time by giving the Landlord not less than two (2) months' written notice, expiring at the end of a rent period."
        ),
        paragraph(
          "2.5  The Landlord may only end the tenancy by serving a valid notice under Section 8 of the Housing Act 1988 (as amended) citing one or more applicable statutory grounds. The Landlord cannot serve a Section 21 notice."
        ),
        paragraph(
          "2.6  During the first twelve (12) months of the tenancy, the Landlord may not use possession grounds related to the Landlord or a family member wishing to occupy the Property, or grounds related to the Landlord's intention to sell the Property."
        ),
      ],
    },
    {
      title: "3. Rent",
      items: [
        paragraph(
          `3.1  The rent for the Property is ${tenancy.rentAmountDisplay} per calendar month (the "Rent").`
        ),
        paragraph(
          `3.2  The Tenant will pay the Rent in advance, on or before the ${tenancy.rentDueDayOrdinal} day of each month, to the Landlord at ${landlord.address}, or at such other place or by such method as the Landlord may designate in writing.`
        ),
        paragraph(
          "3.3  The Landlord may charge an additional amount for each day that a payment of Rent is overdue, but only after expiry of any applicable grace period permitted by law and not exceeding the maximum rate permitted by law."
        ),
        paragraph(
          "3.4  The Landlord may not require the Tenant to pay more than one (1) month's Rent in advance at any time, whether before or during the tenancy, in accordance with the Renters' Rights Act 2025."
        ),
      ],
    },
    {
      title: "4. Rent Increases",
      items: [
        paragraph(
          "4.1  The Landlord may increase the Rent no more than once in any twelve (12) month period."
        ),
        paragraph(
          "4.2  To increase the Rent, the Landlord must serve written notice on the Tenant at least two (2) months before the proposed increase is to take effect, using the procedure prescribed under Section 13 of the Housing Act 1988 (as amended)."
        ),
        paragraph(
          "4.3  The Tenant has the right to challenge any proposed rent increase by application to the First-tier Tribunal (Property Chamber). Any rent determined by the Tribunal will not be backdated."
        ),
        paragraph(
          "4.4  The Landlord may not seek to evict the Tenant in response to the Tenant challenging a rent increase."
        ),
      ],
    },
    {
      title: "5. Security Deposit",
      items: [
        paragraph(
          `5.1  On execution of this Agreement, the Tenant will pay a security deposit of ${tenancy.depositAmountDisplay} (the "Security Deposit").`
        ),
        paragraph(
          `5.2  The Landlord will protect the Security Deposit with the Government-approved ${tenancy.depositSchemeName} tenancy deposit protection scheme within 30 days of receipt and will provide the Tenant with the required Prescribed Information. The deposit reference is ${tenancy.depositReference}.`
        ),
        paragraph("5.3  No interest will accrue on the Security Deposit in favour of the Tenant."),
        paragraph(
          "5.4  The Landlord will return the Security Deposit at the end of the tenancy, less any lawful deductions, within a reasonable time. No deduction will be made for fair wear and tear, nor for anything prohibited by law."
        ),
        paragraph(
          "5.5  During or after the tenancy, the Landlord may make deductions from the Security Deposit for:"
        ),
        list([
          "Repair of damage to walls beyond fair wear and tear, including repainting;",
          "Repainting required due to improper use or excessive damage by the Tenant;",
          "Unplugging toilets, sinks, and drains blocked by the Tenant's misuse;",
          "Replacing damaged or missing doors, windows, screens, mirrors or light fixtures;",
          "Repairing cuts, burns, or water damage caused by the Tenant;",
          "Any other repairs or cleaning due to damage beyond fair wear and tear caused or permitted by the Tenant or persons for whom the Tenant is responsible;",
          "Costs of extermination where the Tenant or the Tenant's guests have introduced insects into the Property;",
          "Repairs required because windows were left open, causing plumbing to freeze or water damage to floors or walls;",
          "Replacement of locks and/or lost keys and any associated administrative fees; and",
          "Any other purpose permitted under this Agreement or the tenancy deposit scheme rules under the Housing Act 2004 (as amended).",
        ]),
        paragraph("5.6  The Tenant may not use the Security Deposit as a substitute for Rent."),
      ],
    },
    {
      title: "6. Pets",
      items: [
        paragraph("6.1  The Tenant has the right to request permission to keep a pet at the Property."),
        paragraph("6.2  The Tenant must make any such request in writing to the Landlord."),
        paragraph(
          "6.3  The Landlord must respond in writing within 28 days of receiving the request. The Landlord may only refuse the request on reasonable grounds. Silence or unreasonable refusal will be treated as consent."
        ),
        paragraph(
          "6.4  Where permission is granted for a pet, the Landlord may require the Tenant to take out and maintain appropriate pet insurance, or such other reasonable conditions as the Landlord may specify, to cover any damage caused by the pet."
        ),
        paragraph(
          "6.5  Any 'no pets' clauses in previous tenancy documents have no legal effect under the Renters' Rights Act 2025."
        ),
        ...(clauses.pets && clauses.petsDescription
          ? [paragraph(`6.6  Permission is granted for the following pet(s): ${clauses.petsDescription}.`)]
          : []),
      ],
    },
    {
      title: "7. Access and Inspection",
      items: [
        paragraph(
          "7.1  The Landlord and Tenant will complete, sign, and date an inspection report (inventory) at the commencement and at the end of the tenancy."
        ),
        paragraph(
          "7.2  The Landlord (or the Landlord's agents) may enter the Property at reasonable times, on giving at least 24 hours' prior written notice, for the purposes of inspection, repair, or showing the Property to prospective tenants or purchasers (only where lawfully permitted to seek possession at the relevant time)."
        ),
        paragraph(
          "7.3  In the case of genuine emergency, the Landlord may enter the Property without prior notice to carry out urgent repairs or to prevent damage or danger."
        ),
      ],
    },
    {
      title: "8. Tenant Improvements",
      items: [
        paragraph("8.1  The Tenant will obtain prior written permission from the Landlord before:"),
        list([
          "Applying adhesive materials, or inserting nails or hooks in walls or ceilings beyond two small picture hooks per wall;",
          "Painting, wallpapering, redecorating or significantly altering the appearance of the Property;",
          "Removing or adding walls or performing any structural alterations;",
          "Installing a waterbed;",
          "Changing the level of heat or power normally used, or installing additional electrical wiring or heating units;",
          "Placing any sign, notice, or advertisement on or about the Property; or",
          "Affixing any radio or TV antenna or tower to or near the Property.",
        ]),
      ],
    },
    {
      title: "9. Utilities and Other Charges",
      items: [
        paragraph(
          "9.1  The Tenant is responsible for the payment of all utility charges relating to the Property, including but not limited to gas, electricity, water, council tax, telephone, and internet, unless otherwise agreed in writing."
        ),
      ],
    },
    {
      title: "10. Insurance",
      items: [
        paragraph(
          "10.1  The Tenant is advised that the Landlord's insurance does not cover the Tenant's personal property. The Tenant is strongly encouraged to obtain their own contents insurance."
        ),
        paragraph(
          "10.2  The Landlord assumes no liability for loss of or damage to the Tenant's personal belongings."
        ),
      ],
    },
    {
      title: "11. Absences",
      items: [
        paragraph(
          "11.1  The Tenant will inform the Landlord if absent from the Property for more than 28 consecutive days, and will take reasonable measures to secure the Property and prevent frost or flood damage."
        ),
        paragraph(
          "11.2  If the Tenant no longer occupies the Property as their only or principal home, the Landlord may apply to end the tenancy by serving a notice pursuant to the applicable statutory ground under Section 8 of the Housing Act 1988 (as amended)."
        ),
        paragraph(
          "11.3  If the Tenant has abandoned the Property, the Landlord is entitled to apply to the court for a possession order."
        ),
        paragraph(
          "11.4  If the Tenant has abandoned or surrendered the Property and the Landlord believes the Property is in an insecure or dangerous condition, the Landlord may enter to carry out urgent repairs. If locks are changed for security reasons, the Landlord must attempt to notify the Tenant."
        ),
      ],
    },
    {
      title: "12. Assignment and Subletting",
      items: [
        paragraph(
          "12.1  The Tenant may not assign this Agreement, or sublet or grant any licence to use the Property or any part of it, without the prior written consent of the Landlord."
        ),
        paragraph(
          "12.2  Any unauthorised assignment or subletting will be void and may entitle the Landlord to seek possession on the relevant statutory ground."
        ),
      ],
    },
    {
      title: "13. Damage to Property",
      items: [
        paragraph(
          "13.1  If the Property is damaged other than by the Tenant's negligence or wilful act, and the Landlord decides not to rebuild or repair, the Landlord may end this Agreement by giving appropriate statutory notice."
        ),
      ],
    },
    {
      title: "14. Maintenance and Repairs",
      items: [
        paragraph(
          "14.1  The Tenant will, at their own expense, keep the Property in good and sanitary condition and repair during the tenancy."
        ),
        paragraph(
          "14.2  The Tenant will keep all fixtures in good order and repair and keep the heating system clean and properly maintained."
        ),
        paragraph(
          "14.3  The Tenant will, at their own expense, make all required repairs to plumbing, ranges, heating apparatus, and electrical and gas fixtures where damage has resulted from the Tenant's misuse, waste, or neglect, or that of the Tenant's household, agent, or visitors."
        ),
        paragraph(
          "14.4  Major maintenance and repair of the Property not due to the Tenant's misuse, waste, or neglect is the responsibility of the Landlord."
        ),
        paragraph(
          "14.5  The Landlord is responsible for ensuring that the Property complies with all relevant health, safety, and housing standards required by law, including maintaining gas, electrical, and fire safety installations."
        ),
      ],
    },
    {
      title: "15. Care and Use of Property",
      items: [
        paragraph("15.1  The Tenant will:"),
        list([
          "Keep any exclusive-use outdoor areas (including driveways, pathways, and parking spaces) clean and free of debris;",
          ...(clauses.garden
            ? [
                "Maintain any garden or grass area in a reasonable condition, including watering, weeding, cutting, and trimming trees and shrubs; and",
              ]
            : []),
          "Promptly notify the Landlord of any damage or situation that may significantly affect the normal use of the Property.",
        ]),
        paragraph(
          "15.2  The Tenant will keep the Property in good repair and decorative order throughout the tenancy."
        ),
        paragraph(
          "15.3  The Tenant or anyone living at the Property will not engage in any illegal trade or activity on or about the Property."
        ),
        paragraph(
          "15.4  The Parties will comply with all applicable standards of health, sanitation, fire, housing, and safety as required by law."
        ),
        paragraph(
          "15.5  At the expiration of the tenancy, the Tenant will return the Property in as good a state and condition as it was at commencement, allowing for reasonable wear and tear."
        ),
      ],
    },
    {
      title: "16. Non-Discrimination",
      items: [
        paragraph(
          "16.1  The Landlord and any letting agent acting on their behalf must not refuse to rent, or otherwise discriminate against, any person because they have children or receive housing benefit or other benefits, in accordance with the Renters' Rights Act 2025."
        ),
        paragraph(
          "16.2  Any tenancy clause or practice that seeks to exclude tenants with children or in receipt of benefits is unlawful."
        ),
      ],
    },
    {
      title: "17. Rules and Regulations",
      items: [
        paragraph(
          "17.1  The Tenant agrees to comply with all reasonable rules and regulations implemented by the Landlord from time to time regarding the use and care of the Property and any shared facilities."
        ),
      ],
    },
    {
      title: "18. Termination of Tenancy",
      items: [
        paragraph(
          "18.1  The Tenant may end the tenancy at any time by giving not less than two (2) months' written notice to the Landlord, expiring at the end of a rent period."
        ),
        paragraph(
          "18.2  The Landlord may only terminate the tenancy by serving on the Tenant a valid notice under Section 8 of the Housing Act 1988 (as amended by the Renters' Rights Act 2025), citing one or more applicable grounds for possession. Section 21 notices can no longer be served."
        ),
        paragraph(
          "18.3  Grounds for possession available to the Landlord include (but are not limited to):"
        ),
        list([
          "The Tenant is in rent arrears of two months or more (Ground 8 - mandatory);",
          "The Tenant has breached any obligation under this Agreement (Ground 12 - discretionary);",
          "The Landlord or a close family member wishes to occupy the Property as their only or principal home (Ground 1 - as amended; cannot be used in the first 12 months of the tenancy);",
          "The Landlord intends to sell the Property (new Ground 1A - cannot be used in the first 12 months of the tenancy); and",
          "Such other grounds as are set out in Schedule 2 to the Housing Act 1988 (as amended).",
        ]),
        paragraph(
          tenancy.reletLevyDisplay
            ? `18.4  Early vacation: If the Tenant moves out prior to giving proper notice in accordance with this Agreement, a relet levy of ${tenancy.reletLevyDisplay} may be charged to the Tenant to cover the Landlord's reasonable re-letting costs, but only to the extent permitted by law.`
            : "18.4  Early vacation: If the Tenant moves out prior to giving proper notice in accordance with this Agreement, the Tenant may be responsible for the Landlord's reasonable re-letting costs, but only to the extent permitted by law."
        ),
      ],
    },
    {
      title: "19. Private Rented Sector Database",
      items: [
        paragraph(
          "19.1  The Landlord acknowledges their obligation to register on the Private Rented Sector (PRS) Database as required under the Renters' Rights Act 2025. The Landlord will not be able to obtain a possession order (other than on grounds of serious criminal or anti-social behaviour) unless they maintain an active and up-to-date entry on the PRS Database."
        ),
      ],
    },
    {
      title: "20. Governing Law",
      items: [
        paragraph(
          "20.1  This Agreement will be construed in accordance with and governed by the laws of England. The Parties submit to the exclusive jurisdiction of the English Courts."
        ),
      ],
    },
    {
      title: "21. Severability",
      items: [
        paragraph(
          "21.1  If there is a conflict between any provision of this Agreement and the Renters' Rights Act 2025 or any other applicable legislation, the legislation will prevail and such provisions will be amended or deleted as necessary. Provisions required by law are incorporated into this Agreement."
        ),
        paragraph(
          "21.2  The invalidity or unenforceability of any provision of this Agreement will not affect the validity or enforceability of any other provision."
        ),
      ],
    },
    {
      title: "22. Amendment of Agreement",
      items: [
        paragraph(
          "22.1  This Agreement may only be amended or modified by a written document signed by both Parties."
        ),
      ],
    },
    {
      title: "23. Addresses for Notice",
      items: [
        paragraph(
          "23.1  For any matter relating to this tenancy, the Tenant may be contacted at the Property or through:"
        ),
        list([
          `Name: ${tenant.fullName}`,
          `Phone: ${tenant.phone}`,
          ...(tenant.email ? [`Email: ${tenant.email}`] : []),
        ]),
        paragraph(
          "23.2  The Landlord's contact details for all matters relating to this tenancy are:"
        ),
        list([
          `Name: ${landlord.fullName}`,
          `Address: ${landlord.address}`,
          `Phone: ${landlord.phone}`,
          `Email: ${landlord.email}`,
        ]),
        paragraph(
          "23.3  Either Party may change their address for notice by giving written notice to the other Party."
        ),
      ],
    },
    {
      title: "24. General Provisions",
      items: [
        paragraph(
          "24.1  Any waiver by the Landlord of any failure by the Tenant to perform or observe the provisions of this Agreement will not operate as a waiver of the Landlord's rights in respect of any subsequent default or breach."
        ),
        paragraph(
          "24.2  This Agreement extends to and is binding upon the respective heirs, executors, administrators, successors, and permitted assigns of each Party."
        ),
        paragraph(
          "24.3  All sums payable by the Tenant pursuant to this Agreement will be deemed additional rent and recoverable accordingly."
        ),
        paragraph(
          "24.4  Locks may not be added or changed without the prior written agreement of both Parties, or unless the changes are made in compliance with applicable law."
        ),
        paragraph(
          "24.5  During the last 30 days of notice to end the tenancy, where the Landlord is lawfully entitled to possession, the Landlord or the Landlord's agents will have the privilege of displaying 'To Let' or 'For Sale' signs on the Property, and the Tenant agrees to allow reasonable access for this purpose."
        ),
        paragraph(
          "24.6  Headings are for convenience only and are not to be considered when interpreting this Agreement. Words in the singular include the plural and vice versa."
        ),
        paragraph(
          "24.7  This Agreement constitutes the entire agreement between the Parties and supersedes all prior negotiations, representations, and agreements."
        ),
        paragraph("24.8  Time is of the essence in this Agreement."),
      ],
    },
  ];
}
