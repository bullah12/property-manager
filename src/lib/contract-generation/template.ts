import type { LeaseV2ViewModel } from "./view-model";

export type LeaseTemplateItem =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "property" };

export interface LeaseTemplateSection {
  title: string;
  items: LeaseTemplateItem[];
}

const paragraph = (text: string): LeaseTemplateItem => ({ kind: "paragraph", text });
const list = (items: string[]): LeaseTemplateItem => ({ kind: "list", items });

/**
 * Conservative England assured-periodic agreement based on the written
 * information required from 1 May 2026. It avoids attempting to reproduce the
 * statutory possession grounds or shifting non-excludable repair duties.
 */
export function buildLeaseSections(viewModel: LeaseV2ViewModel): LeaseTemplateSection[] {
  const { landlord, tenant, tenancy, clauses } = viewModel;
  const depositDetails = tenancy.depositTaken
    ? [
        paragraph(`4.1  The tenancy deposit is ${tenancy.depositAmountDisplay}.`),
        paragraph(
          `4.2  The Landlord will protect the deposit in a government-approved tenancy deposit protection scheme and give the Tenant the prescribed information within 30 days of receiving the deposit.${tenancy.depositSchemeName ? ` The intended scheme is ${tenancy.depositSchemeName}.` : ""}${tenancy.depositReference ? ` The current reference is ${tenancy.depositReference}.` : ""}`
        ),
        paragraph(
          "4.3  At the end of the tenancy, the deposit may be used only for lawful deductions supported by the agreement, the evidence and the applicable deposit-scheme rules. Fair wear and tear is not chargeable."
        ),
      ]
    : [paragraph("4.1  No tenancy deposit is required under this Agreement.")];

  const contactLines = [
    `Landlord: ${landlord.fullName}, ${landlord.address}.`,
    ...(landlord.phone ? [`Landlord telephone: ${landlord.phone}.`] : []),
    ...(landlord.email ? [`Landlord email: ${landlord.email}.`] : []),
    `Tenant: ${tenant.fullName}, at the Property after the tenancy starts.`,
    ...(tenant.phone ? [`Tenant telephone: ${tenant.phone}.`] : []),
    ...(tenant.email ? [`Tenant email: ${tenant.email}.`] : []),
    "A change to the terms of this Agreement requires the agreement of both Parties, except where legislation provides a separate statutory procedure.",
  ].map((text, index) => paragraph(`15.${index + 1}  ${text}`));

  return [
    {
      title: "1. Parties and Property",
      items: [
        paragraph(`1.1  The Landlord is ${landlord.fullName}.`),
        paragraph(
          `1.2  The Landlord's postal address in England or Wales for service of notices is ${landlord.address}.`
        ),
        paragraph(`1.3  The Tenant is ${tenant.fullName}.`),
        paragraph("1.4  The Property is:"),
        { kind: "property" },
        paragraph("1.5  The Property is let to the Tenant as their only or principal home."),
      ],
    },
    {
      title: "2. Nature and Start of the Tenancy",
      items: [
        paragraph(
          "2.1  This Agreement creates an assured periodic tenancy under the Housing Act 1988 as amended. It is not an assured shorthold tenancy and it has no fixed end date."
        ),
        paragraph(`2.2  The Tenant is first entitled to possession on ${tenancy.startDateLong}.`),
        paragraph(
          "2.3  The tenancy runs from month to month and continues until ended by the Tenant, by written agreement, or through the lawful possession process."
        ),
      ],
    },
    {
      title: "3. Rent and Bills",
      items: [
        paragraph(`3.1  The rent is ${tenancy.rentAmountDisplay} per calendar month.`),
        paragraph(
          `3.2  Rent is due in advance on the ${tenancy.rentDueDayOrdinal} day of each month by the payment method separately notified by the Landlord. Rent cannot be required before it is due, except where legislation expressly permits.`
        ),
        paragraph(
          clauses.billsIncluded
            ? `3.3  The rent includes the following bills: ${clauses.billsDescription}. No separate payment is due for those listed bills unless the Parties later agree a lawful change in writing.`
            : "3.3  No bills are included in the rent. The Tenant is responsible for arranging and paying council tax, gas, electricity, water and sewage, television licence, telephone, internet and other communications services that apply to their occupation."
        ),
        paragraph(
          "3.4  Any fee or other payment requested from the Tenant must be permitted by the Tenant Fees Act 2019 and any other applicable legislation."
        ),
      ],
    },
    { title: "4. Tenancy Deposit", items: depositDetails },
    {
      title: "5. Rent Increases",
      items: [
        paragraph(
          "5.1  If the Landlord proposes a new rent, the Landlord will serve notice on the Tenant in accordance with section 13 of the Housing Act 1988."
        ),
        paragraph(
          "5.2  The statutory process must be followed for every rent increase, including the applicable form and notice period. The Tenant may refer a proposed increase to the First-tier Tribunal where the law permits."
        ),
      ],
    },
    {
      title: "6. Tenant Ending the Tenancy",
      items: [
        paragraph(
          "6.1  The Tenant may end the tenancy by giving the Landlord two months' written notice. The notice must comply with the applicable statutory requirements."
        ),
        paragraph(
          "6.2  The Parties may later agree in writing to a shorter notice period. All joint tenants must agree to any such change."
        ),
      ],
    },
    {
      title: "7. Landlord Ending the Tenancy",
      items: [
        paragraph(
          "7.1  In most circumstances the Landlord can end the tenancy only by obtaining an order for possession and having that order executed."
        ),
        paragraph(
          "7.2  When seeking possession, the Landlord will normally serve a possession notice using the correct form and specifying the statutory ground or grounds relied upon. The minimum notice period depends on those grounds."
        ),
        paragraph(
          "7.3  Nothing in this Agreement permits the Landlord to use section 21 of the Housing Act 1988 or to evict the Tenant without following the lawful process."
        ),
      ],
    },
    {
      title: "8. Fitness, Structure and Repairs",
      items: [
        paragraph(
          "8.1  Section 9A of the Landlord and Tenant Act 1985 places the Landlord under an obligation to ensure that the Property is fit for human habitation, to the extent required by that section."
        ),
        paragraph(
          "8.2  Section 11 of the Landlord and Tenant Act 1985 places the Landlord under an obligation, to the extent required by that section, to keep in repair the structure and exterior of the Property; to keep in repair and proper working order the installations for water, gas, electricity and sanitation; and to keep in repair and proper working order the installations for space heating and heating water."
        ),
        paragraph(
          "8.3  The Tenant must promptly report disrepair or safety concerns and allow reasonable access for inspection and repair. Nothing in this Agreement contracts out of the Landlord's statutory obligations."
        ),
      ],
    },
    {
      title: "9. Electrical Safety",
      items: [
        paragraph(
          "9.1  Regulation 3 of the Electrical Safety Standards in the Private Rented Sector and Social Rented Sector (England) Regulations 2020 places the Landlord under an obligation, where it applies, to ensure the relevant electrical safety standards are met during the tenancy."
        ),
        paragraph(
          "9.2  The Landlord must ensure the relevant electrical installations are inspected and tested by a qualified person at least every five years, or sooner if the latest report requires, obtain the report and supply a copy to the Tenant."
        ),
      ],
    },
    {
      title: "10. Gas Safety (where applicable)",
      items: clauses.gasSafetyApplies
        ? [
            paragraph(
              "10.1  Regulation 36 of the Gas Safety (Installations and Use) Regulations 1998 places the Landlord under an obligation to keep relevant gas fittings and flues in a safe condition and to arrange safety checks at the intervals determined by those Regulations."
            ),
            paragraph(
              "10.2  Required gas safety checks must be carried out by a Gas Safe registered engineer. The Landlord must obtain the gas safety record and provide a copy to each Tenant."
            ),
          ]
        : [
            paragraph(
              "10.1  Where Regulation 36 of the Gas Safety (Installations and Use) Regulations 1998 applies to the Property, the Landlord must comply with its safety, inspection, record and tenant-copy requirements. Nothing in this Agreement limits those duties."
            ),
          ],
    },
    {
      title: "11. Disability-Related Improvements",
      items: [
        paragraph(
          "11.1  Section 190 of the Equality Act 2010 provides that the Landlord must not unreasonably withhold consent to a request for an improvement where a disabled person occupies or intends to occupy the Property as their only or main home and the improvement would help that person enjoy the Property as their home."
        ),
        paragraph(
          "11.2  Section 190 does not apply where this Agreement already contains terms with a similar effect."
        ),
        paragraph(
          "11.3  'Disabled person' is defined by section 6 of the Equality Act 2010 and 'improvement' is defined by section 190(9) of that Act."
        ),
      ],
    },
    {
      title: "12. Pets",
      items: [
        paragraph(
          "12.1  The Tenant may keep a pet at the Property if they make a written request in accordance with section 16A of the Housing Act 1988 and the Landlord gives consent. The Landlord cannot unreasonably refuse consent."
        ),
        paragraph(
          "12.2  The Landlord will respond to a written pet request in accordance with the statutory timescales and give written reasons for any refusal."
        ),
        ...(clauses.pets && clauses.petsDescription
          ? [paragraph(`12.3  Consent is recorded for the following pet: ${clauses.petsDescription}.`)]
          : []),
      ],
    },
    {
      title: "13. Tenant Responsibilities",
      items: [
        paragraph("13.1  The Tenant must:"),
        list([
          "pay the rent and agreed bills when due;",
          "use the Property as a private home and not cause nuisance, harassment or antisocial behaviour;",
          "take reasonable care of the Property and the Landlord's fixtures, fittings and contents;",
          "keep the interior reasonably clean and ventilated, allowing for fair wear and tear;",
          "promptly report damage, disrepair, leaks, hazards or safety concerns;",
          "not assign, sublet or part with possession without the Landlord's prior written consent; and",
          ...(clauses.garden
            ? ["keep any garden included with the Property reasonably tidy, without being responsible for structural, specialist or unsafe work."]
            : []),
        ]),
        paragraph(
          "13.2  The Tenant is responsible for damage caused by their deliberate or negligent act or omission, or that of their household or visitors, but is not responsible for fair wear and tear or matters falling within the Landlord's statutory duties."
        ),
      ],
    },
    {
      title: "14. Access",
      items: [
        paragraph(
          "14.1  Except in a genuine emergency or where the law permits otherwise, the Landlord or contractor will give at least 24 hours' written notice and seek access at a reasonable time for inspection, safety checks or repairs."
        ),
        paragraph(
          "14.2  Notice does not remove the Tenant's right to quiet enjoyment. The Parties should agree a suitable appointment wherever reasonably possible."
        ),
      ],
    },
    {
      title: "15. Contact and Notices",
      items: contactLines,
    },
    {
      title: "16. General",
      items: [
        paragraph("16.1  This Agreement is governed by the law of England."),
        paragraph(
          "16.2  If a term conflicts with legislation or is unfair or unenforceable, the legislation prevails and the remaining terms continue so far as legally possible."
        ),
        paragraph(
          "16.3  This Agreement records the terms agreed between the Parties. It does not replace any certificate, prescribed information or statutory notice that must be provided separately."
        ),
      ],
    },
  ];
}
