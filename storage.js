/* Data layer: Airtable-backed store shared across every device that has a
   Personal Access Token for The Safety Inspector base (see config.js for the
   base ID). Uses the Airtable REST API directly via fetch — no client
   library needed. */

function uid(prefix) {
  return (prefix ? prefix + "_" : "") + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function nowIso() {
  return new Date().toISOString();
}

let airtableToken = null;

function initAirtableClient() {
  airtableToken = getAirtableToken();
  return !!airtableToken;
}

/* ---------------- low-level Airtable REST helpers ---------------- */

async function atRequest(path, options = {}) {
  const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${airtableToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    let message = `Airtable error ${res.status}`;
    try { const body = await res.json(); message = (body.error && (body.error.message || body.error.type)) || message; } catch (e) { /* ignore */ }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function atListAll(tableName, params = {}) {
  const records = [];
  let offset;
  do {
    const qs = new URLSearchParams(params);
    qs.set("pageSize", "100");
    if (offset) qs.set("offset", offset);
    else qs.delete("offset");
    const data = await atRequest(`/${encodeURIComponent(tableName)}?${qs.toString()}`);
    records.push(...data.records);
    offset = data.offset;
  } while (offset);
  return records;
}

async function atGet(tableName, id) {
  const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}/${id}`, {
    headers: { Authorization: `Bearer ${airtableToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    let message = `Airtable error ${res.status}`;
    try { const body = await res.json(); message = (body.error && body.error.message) || message; } catch (e) { /* ignore */ }
    throw new Error(message);
  }
  return res.json();
}

function atCreate(tableName, fields) {
  return atRequest(`/${encodeURIComponent(tableName)}`, { method: "POST", body: JSON.stringify({ fields }) });
}

function atUpdate(tableName, id, fields) {
  return atRequest(`/${encodeURIComponent(tableName)}/${id}`, { method: "PATCH", body: JSON.stringify({ fields }) });
}

function atDelete(tableName, id) {
  return atRequest(`/${encodeURIComponent(tableName)}/${id}`, { method: "DELETE" });
}

function escapeFormulaValue(v) {
  return String(v).replace(/'/g, "\\'");
}

/* ---------------- record <-> app object mapping ---------------- */

function fromTemplateRecord(rec) {
  return {
    id: rec.id,
    name: rec.fields.Name || "",
    description: rec.fields.Description || "",
    items: rec.fields.Items ? JSON.parse(rec.fields.Items) : [],
    createdAt: rec.createdTime,
  };
}
function toTemplateFields(tpl) {
  return { Name: tpl.name, Description: tpl.description || "", Items: JSON.stringify(tpl.items || []) };
}

function fromInspectionRecord(rec) {
  return {
    id: rec.id,
    templateId: rec.fields.TemplateId || "",
    templateName: rec.fields.TemplateName || "",
    title: rec.fields.Title || "",
    inspector: rec.fields.Inspector || "",
    location: rec.fields.Location || "",
    workArea: rec.fields.WorkArea || "",
    date: rec.fields.Date || "",
    status: rec.fields.Status || "in-progress",
    items: rec.fields.Items ? JSON.parse(rec.fields.Items) : [],
    createdAt: rec.createdTime,
    completedAt: rec.fields.CompletedAt || null,
  };
}
function toInspectionFields(insp) {
  return {
    Title: insp.title,
    TemplateId: insp.templateId,
    TemplateName: insp.templateName,
    Inspector: insp.inspector || "",
    Location: insp.location || "",
    WorkArea: insp.workArea || "",
    Date: insp.date,
    Status: insp.status,
    Items: JSON.stringify((insp.items || []).map((it) => ({ id: it.id, text: it.text, result: it.result, notes: it.notes }))),
    CompletedAt: insp.completedAt || null,
  };
}

function fromIssueRecord(rec) {
  return {
    id: rec.id,
    inspectionId: rec.fields.InspectionId || "",
    inspectionTitle: rec.fields.InspectionTitle || "",
    itemId: rec.fields.ItemId || "",
    itemText: rec.fields.ItemText || "",
    description: rec.fields.Description || "",
    location: rec.fields.Location || "",
    severity: rec.fields.Severity || "medium",
    status: rec.fields.Status || "open",
    createdAt: rec.createdTime,
    resolvedAt: rec.fields.ResolvedAt || null,
    resolutionNotes: rec.fields.ResolutionNotes || "",
    photo: null,
  };
}
function toIssueFields(issue) {
  return {
    ItemText: issue.itemText,
    InspectionId: issue.inspectionId,
    InspectionTitle: issue.inspectionTitle,
    ItemId: issue.itemId,
    Description: issue.description || "",
    Location: issue.location || "",
    Severity: issue.severity || "medium",
    Status: issue.status || "open",
    ResolvedAt: issue.resolvedAt || null,
    ResolutionNotes: issue.resolutionNotes || "",
  };
}

/* ---------------- template library (shared seed data) ---------------- */

const TEMPLATE_LIBRARY = [
  {
    name: "Fire Safety Equipment Check",
    description: "Fire extinguishers, alarms, and emergency exits — OSHA 29 CFR 1910.157, 1910.164.",
    items: [
      "Portable fire extinguishers are mounted at every required location (max 75 ft travel distance for Class A hazards), the pressure gauge needle sits in the green/charged zone, and access is not blocked by pallets, carts, or storage within 3 feet",
      "The extinguisher's annual maintenance tag is signed and dated within the last 12 months, and the attached monthly visual-inspection card shows no gaps of more than one missed month",
      "Illuminated exit signs mark every fire exit and remain lit and legible during a power outage via battery backup or self-luminous construction",
      "The full width of the path to each fire exit — corridors, aisles, and doorways — is completely clear of furniture, pallets, cords, or equipment that would slow an evacuation",
      "Fire alarm pull stations are mounted at the required 42–48 inch height, remain unobstructed, and are not hidden behind equipment, signage, or stored materials",
      "Smoke detectors are installed in every required area, show a steady active/power indicator light when checked, and are free of dust, paint overspray, or decorative covers that would impair detection",
      "Emergency egress lighting activates immediately when the push-to-test button is pressed and provides at least 90 minutes of illumination along the entire path of egress",
      "Sprinkler heads maintain at least 18 inches of clearance on all sides — no boxes, stock, or signage stored closer, which would block or redirect water distribution during a fire",
    ],
  },
  {
    name: "General Workplace Walkthrough",
    description: "Routine walkthrough covering housekeeping, PPE, and electrical hazards.",
    items: [
      "Every walkway and aisle observed during the walkthrough is clear of clutter, coiled cords, pallets, or other objects an employee could trip over",
      "Any spill or leak encountered — oil, water, chemical — is either already cleaned up or actively being addressed with proper containment and signage at the time of the walkthrough",
      "Employees performing tasks that require PPE (cutting, grinding, chemical handling, etc.) are observed wearing the correct type, worn properly — not pushed up, unfastened, or missing a component",
      "Guards on operating machinery are fully in place, fastened, and not propped open or removed for easier access to the point of operation",
      "Electrical panels throughout the facility have the full 36 inches of clear floor space maintained directly in front of them, with nothing stored or parked in that zone",
      "Extension cords observed in use show no cracked insulation or exposed wire, are rated for the load they're carrying, and are not plugged into one another in a chain",
      "The first aid kit is stocked to the level required for the facility's employee count, and a spot check shows no items past their expiration date",
      "The eyewash station is unobstructed within roughly 10 seconds' walking distance of the hazard, and activating it for a few seconds produces a clean, steady flow from both nozzles",
      "Every chemical container observed, including secondary containers, has a legible label identifying contents and hazard warnings, not just a handwritten abbreviation",
      "The SDS binder (or the facility's electronic SDS system) is accessible without a password barrier and includes a sheet for every chemical currently observed on-site",
    ],
  },
  {
    name: "Walking-Working Surfaces",
    description: "OSHA 29 CFR 1910 Subpart D — floors, aisles, stairways, elevated surfaces.",
    items: [
      "Floors throughout the inspected area are clean, dry, and free of holes, cracked tile, or damaged boards that could catch a foot or twist an ankle",
      "Aisles and walkways are marked with floor striping or signage that remains visible, not worn away, and the marked path is kept clear of stored material or parked equipment",
      "Any spill found is cleaned up immediately, with a wet-floor cone or sign left in place until the surface tests dry to the touch",
      "Floor openings, pits, or holes are covered with a load-rated cover secured against displacement, or guarded on all exposed sides by a standard railing",
      "Guardrails (42 in. top rail, mid-rail, toe board where needed) are installed on every elevated platform or open-sided floor 4 feet or more above the surface below",
      "Stairways have a secure, graspable handrail on at least one side for its full length, and the treads and landings are kept clear of stored items",
      "Posted floor load limits are visible in storage or mezzanine areas, and a visual estimate of current loading does not appear to exceed the posted rating",
      "Non-slip matting, coating, or striping is in place in areas that are routinely wet, greasy, or otherwise prone to become slippery, and shows no worn-through or curling edges",
    ],
  },
  {
    name: "Means of Egress & Exit Routes",
    description: "OSHA 29 CFR 1910.34–1910.39 — exit routes and emergency egress.",
    items: [
      "Exit routes are permanently marked with illuminated exit signs positioned so at least one is visible from any point along the route, including around corners",
      "Where a single blocked exit could trap employees, at least two remote exit routes are provided, and both remain usable — not one designated as storage overflow",
      "Exit doors open from the inside with a single motion, without a key, special tool, or knowledge of a code or sequence",
      "The exit route stays clear of storage, equipment, trip hazards, or dead-end configurations along its entire length and width, not just at the doorway",
      "Evacuation route maps showing the current floor layout, exits, and assembly point are posted at visible, standard locations such as near exits and break areas",
      "Where the occupant load requires it, doors along the route swing in the direction of exit travel, not against it",
      "The point where the exit route discharges leads directly to a street, open area, or other location recognized as safe from the hazard being evacuated, not into a fenced or enclosed area",
    ],
  },
  {
    name: "Emergency Action Plan",
    description: "OSHA 29 CFR 1910.38 — emergency and evacuation planning.",
    items: [
      "A written emergency action plan is available on-site, addresses the specific emergency scenarios relevant to this facility, and isn't a generic, unmodified template",
      "When asked, a sample of employees can describe their evacuation route and the designated assembly point, confirming the plan has actually been communicated, not just filed away",
      "Training records show employees have completed emergency procedures training, including what to do and who to report to during an evacuation",
      "The alarm system audibly and/or visually alerts employees throughout the facility, including areas with high ambient noise or employees who are deaf or hard of hearing",
      "Specific employees are named and trained as evacuation wardens or assistants, including a plan for helping any employees who would need assistance evacuating",
      "Emergency contact numbers — fire, medical, facility management, utility shutoff — are posted at a visible, consistent location such as near a phone or exit",
      "The plan carries a review date within the last 12 months and reflects the current layout, staffing, and operations of the facility, not an outdated floor plan",
    ],
  },
  {
    name: "Hazard Communication (GHS)",
    description: "OSHA 29 CFR 1910.1200 — chemical labeling, SDS, and training.",
    items: [
      "A written Hazard Communication Program is available on-site, and a spot check shows it lists the chemicals actually observed in use, not just chemicals from a prior operation",
      "Safety Data Sheets are accessible to any employee at any time without needing to ask a supervisor for a key, password, or permission to view them",
      "A sample of chemical containers shows GHS-compliant labels with product identifier, pictograms, signal word, and hazard statements that match the corresponding SDS",
      "Training records confirm employees received hazard communication training — covering how to read a label and SDS — before they began working with hazardous chemicals, not after",
      "Secondary containers, such as spray bottles or containers decanted from a bulk drum, carry a label identifying contents and hazard information rather than being left blank or marked with initials only",
      "The chemical inventory list matches what's actually observed in storage and use areas, with no unlisted containers found during the walkthrough",
    ],
  },
  {
    name: "Personal Protective Equipment (PPE)",
    description: "OSHA 29 CFR 1910 Subpart I — PPE assessment, availability, and use.",
    items: [
      "A documented PPE hazard assessment exists, is signed/dated, and identifies the specific PPE required for each task or work area observed",
      "Required PPE is stocked in a range of sizes, shows no visible damage such as cracked lenses or torn material, and is stored where employees can access it without delay",
      "A sample of employees performing hazardous tasks is observed wearing the PPE identified in the hazard assessment, worn as designed — safety glasses under a face shield, gloves fully on, etc.",
      "PPE shows evidence of a regular inspection routine (tags, logs, or visibly well-maintained condition) rather than damaged equipment still in active use",
      "Eye and face protection meeting ANSI Z87.1 is provided and worn wherever there's a risk of flying particles, splashes, or radiant energy, matched to the specific hazard",
      "Hand protection issued matches the specific hazard of the task — cut-resistant for sharp materials, chemical-resistant for solvents, insulated for heat — rather than a single general-purpose glove for every task",
      "Training records for PPE use, including how to properly don, doff, and inspect each type issued, are current for every employee required to wear it",
    ],
  },
  {
    name: "Electrical Safety",
    description: "OSHA 29 CFR 1910 Subpart S — wiring, panels, and equipment grounding.",
    items: [
      "Every electrical panel and disconnect has the full 36 inches of clear working space maintained directly in front of it, with nothing stored, parked, or hung in that zone",
      "Panel directories are typed or clearly handwritten, up to date with any recent circuit changes, and legible without needing to guess which breaker controls what",
      "A sample of wiring and cords throughout the area shows no exposed conductors, cracked or brittle insulation, or repairs made with tape instead of proper splicing",
      "GFCI protection is installed and trips correctly when tested with the built-in test button on outlets in wet locations, outdoors, and other code-required areas",
      "Extension cords in use are clearly for temporary purposes — not run through walls, ceilings, or doorways, and not left in place as permanent wiring for months",
      "Every outlet and switch has an intact cover plate with no cracks or missing screws, and no wiring is visible around the edges",
      "Equipment grounding is intact — three-prong plugs are not modified to fit two-prong outlets, and ground pins are not bent, broken, or removed",
    ],
  },
  {
    name: "Machine Guarding",
    description: "OSHA 29 CFR 1910.212 — guarding of machinery and moving parts.",
    items: [
      "Point-of-operation guards are installed on every machine where an operator's hands or body could reach into the danger zone, and the guard actually prevents that access when tested",
      "Belts, pulleys, gears, chains, and other power transmission parts are fully enclosed by guards, with no gaps large enough to insert a hand or finger",
      "No machine guard shows signs of having been removed, propped open with a block or tape, or bypassed with a jumper to keep the machine running with the guard open",
      "Emergency stop controls are unobstructed, clearly marked, reachable without stepping toward the hazard, and confirmed by testing to immediately stop the machine",
      "Machines that could tip, walk, or shift during operation are bolted, anchored, or otherwise secured to the floor or a fixed structure",
      "Warning signage identifying specific hazards — pinch points, rotating shafts, high-pressure lines — is posted at eye level near the hazard, not generic or faded beyond legibility",
    ],
  },
  {
    name: "Lockout/Tagout (Control of Hazardous Energy)",
    description: "OSHA 29 CFR 1910.147 — energy control procedures.",
    items: [
      "A written energy control program is documented, covers all energy types present (electrical, hydraulic, pneumatic, gravity, stored), and is accessible to authorized employees without delay",
      "Machine-specific procedures are documented for each piece of equipment requiring lockout, listing every energy source, its isolation point, and the verification method — not a single generic procedure for all equipment",
      "Locks, tags, hasps, and blocks needed to isolate every energy source are stocked in sufficient quantity, with no employee needing to share a single lock across multiple jobs",
      "Only employees who have completed authorized lockout/tagout training perform the procedure, and their training records are current, not expired or undocumented",
      "A periodic inspection of each lockout procedure is documented at least annually, performed by someone other than the employee using the procedure, and includes a review with affected employees",
      "Locks and tags in place are legible, identify the specific employee who applied them by name rather than a shared department tag, and show no signs of being removed by anyone else",
    ],
  },
  {
    name: "Materials Handling & Storage",
    description: "OSHA 29 CFR 1910 Subpart N — storage, stacking, and manual handling.",
    items: [
      "Stacked materials are cross-tied, blocked, interlocked, or limited in height so the stack cannot slide, topple, or collapse under normal handling",
      "Storage racks show no bent frames, missing safety pins, or visible overloading beyond the capacity plate posted on the rack",
      "Aisles between storage areas are wide enough for the forklift, pallet jack, or cart actually used to pass through without forcing an operator to squeeze by stored material",
      "Heavier, bulkier, or harder-to-handle items are stored at or below waist height, with lighter items on the upper shelves rather than the reverse",
      "Mechanical lifting aids appropriate to the load — hand truck, hoist, pallet jack — are available near storage areas and show signs of actual use, not sitting unused while employees lift manually",
      "A walk of the storage area confirms materials are not stacked in front of sprinkler heads, electrical panels, fire extinguishers, or exit routes, even temporarily",
    ],
  },
  {
    name: "Powered Industrial Trucks (Forklifts)",
    description: "OSHA 29 CFR 1910.178 — forklift operation and maintenance.",
    items: [
      "Every operator observed or scheduled to operate a forklift holds a current certification specific to the type of truck and has completed both classroom and hands-on evaluation",
      "A documented pre-operation inspection checklist is completed and signed before the start of each shift a forklift is used, with any defects noted taken out of service",
      "The horn sounds when tested, headlights and taillights illuminate, and the backup alarm sounds automatically when the truck is shifted into reverse",
      "The data plate is securely attached, fully legible, and its rated capacity matches the attachment currently mounted on the truck, since capacity changes with attachments",
      "Forks show no visible cracks, are not bent beyond the manufacturer's tolerance, and the heel of the fork shows no excessive wear",
      "Battery charging areas have adequate ventilation to prevent hydrogen gas buildup, and fuel storage/dispensing areas are equipped with appropriate fire extinguishing equipment",
      "Marked pedestrian walkways are physically separated from forklift travel aisles where possible, with convex mirrors or signage at blind intersections",
    ],
  },
  {
    name: "Ladders",
    description: "OSHA 29 CFR 1910.23 — portable and fixed ladder safety.",
    items: [
      "A visual check of ladders in use shows no cracked or split rails, missing or loose rungs, or hardware that isn't fully tightened",
      "The ladder's duty rating meets or exceeds the combined weight of the worker, tools, and materials for the task being performed",
      "Employees are observed performing a quick visual and functional check of a ladder — spreader locks, feet, rung condition — before climbing, not just grabbing and going",
      "Extension ladders in use are set at the proper 4:1 angle, confirmed by the worker standing with toes at the ladder's base and arms extended reaching the rung at shoulder height",
      "Ladders in use are either tied off at the top, held by a second employee, or otherwise secured against the surface to prevent the base from kicking out",
      "Any ladder identified with damage is immediately removed from service, tagged \"Do Not Use,\" and physically separated from usable ladders rather than left in the general storage area",
    ],
  },
  {
    name: "Welding, Cutting & Brazing",
    description: "OSHA 29 CFR 1910 Subpart Q — hot work safety.",
    items: [
      "A dedicated, trained fire watch with a charged extinguisher remains at the hot work location during the work and for at least 30 minutes after it's completed",
      "Combustible materials within 35 feet of the hot work are relocated, or if they can't be moved, are covered with a fire-resistant blanket or shielded by a barrier",
      "Non-combustible welding screens or curtains are positioned to block line-of-sight to the arc for any nearby workers or walkway",
      "The welder is wearing a helmet with the correct shade lens for the process and amperage being used, flame-resistant gloves, and a leather or FR apron with no exposed skin at the wrists or collar",
      "A fire extinguisher rated for the materials present, not just any extinguisher, is staged within immediate reach of the hot work location — not down the aisle or in another room",
      "Compressed gas cylinders used for the work are secured upright on a cart or chained to a fixed point, with regulators removed and valve caps on when not connected",
      "Ventilation, local exhaust, general dilution, or both, keeps welding fume concentrations below exposure limits, confirmed by the absence of visible haze lingering in the work area",
    ],
  },
  {
    name: "Compressed Gas Cylinders",
    description: "OSHA 29 CFR 1910.101 — storage and handling of compressed gas.",
    items: [
      "Every cylinder observed, whether in use or storage, is secured upright with a chain or strap positioned in the upper third of the cylinder to prevent tipping",
      "Cylinders not currently connected to a regulator have their valve protection cap threaded on, not just resting on top",
      "Cylinder storage is located at least 20 feet from space heaters, welding operations, or other ignition/heat sources, or separated by a fire-rated wall",
      "Oxygen cylinders are stored at least 20 feet from fuel-gas cylinders such as acetylene or propane, or the two groups are separated by a fire-rated barrier at least 5 feet tall",
      "Each cylinder's contents are identified by a legible label or stencil — color alone is not a reliable identifier and should not be the only method used",
      "Empty and full cylinders are stored in separate, clearly marked areas so an empty cylinder isn't mistakenly connected for use",
    ],
  },
  {
    name: "Confined Space Entry",
    description: "OSHA 29 CFR 1910.146 — permit-required confined spaces.",
    items: [
      "Every confined space in the facility is identified with a posted \"Permit-Required Confined Space\" or equivalent warning sign at each entry point",
      "The written confined space program lists the specific spaces present at this facility, not a generic list, and reflects any spaces added or removed since the last update",
      "Atmospheric testing results — oxygen, combustibility, toxic gases — from before the most recent entry are documented and show readings were within safe limits before entry began",
      "A completed entry permit for the most recent entry is on file, listing the hazards identified, control measures used, and names of entrants and the attendant",
      "The employee assigned as attendant during an entry remains at the entry point for the entire duration, maintains communication with entrants, and does not enter the space themselves",
      "Rescue equipment matched to the specific space — tripod, winch, retrieval line — is staged and ready before entry begins, or an outside rescue service has been arranged and confirmed available",
      "Training records show entrants, attendants, and supervisors have completed confined space training specific to their role before participating in an entry",
    ],
  },
  {
    name: "Respiratory Protection",
    description: "OSHA 29 CFR 1910.134 — respirator selection, use, and maintenance.",
    items: [
      "A written respiratory protection program is in place and lists the specific respirator makes/models actually issued and used at this facility",
      "Employees assigned a respirator have a medical evaluation on file from within the required interval and have passed a fit test for that specific make and model, not just any respirator of that type",
      "The respirator's cartridge or filter type is matched to the specific hazard — organic vapor, particulate, acid gas — present in the employee's work area, not a generic all-purpose cartridge",
      "Respirators are stored in a sealed bag or container between uses, away from contaminants and direct sunlight, and show no cracking or degradation of the facepiece seal",
      "Cartridges and filters carry a change-out date or schedule that's being followed, rather than left in service based on smell or visible loading alone",
      "Employees can demonstrate the correct donning, seal-check, and doffing procedure for their assigned respirator when asked, confirming training was effective and not just completed on paper",
    ],
  },
  {
    name: "Hearing Conservation",
    description: "OSHA 29 CFR 1910.95 — noise exposure and hearing protection.",
    items: [
      "Noise level measurements for high-noise areas are documented and dated within the required monitoring interval, using a calibrated sound level meter or dosimeter, not an estimate",
      "Hearing protection (plugs or muffs) is stocked in a dispenser or storage point at or near the entrance to any area where the 8-hour average noise level exceeds the action level",
      "Employee audiogram records for those enrolled in the hearing conservation program show a baseline and an annual test within the last 12 months, with any standard threshold shifts flagged and addressed",
      "Employees observed in high-noise areas are wearing hearing protection correctly — foam plugs fully compressed and inserted, muffs sealed against the head without hair or safety glasses breaking the seal",
      "Warning signage stating hearing protection is required is posted at every entrance to a high-noise area, not just the main entrance to the department",
    ],
  },
  {
    name: "Bloodborne Pathogens",
    description: "OSHA 29 CFR 1910.1030 — exposure control and first aid.",
    items: [
      "The written exposure control plan is available on-site, reflects current job classifications with occupational exposure risk, and carries a review/update date within the last year",
      "Sharps containers are puncture-resistant, labeled with the biohazard symbol, mounted at a usable height near the point of use, and not filled past the manufacturer's fill line",
      "Gloves and other PPE for bloodborne pathogen exposure are stocked in accessible locations near where exposure could occur, in sizes that fit the employees who would use them",
      "Records show Hepatitis B vaccination was offered at no cost within 10 working days of initial assignment to every employee with reasonably anticipated occupational exposure, with declinations documented for anyone who opted out",
      "A spill kit for bodily fluids is stocked, sealed, and stored at a location employees can identify without being told, with clear signage marking where it is",
      "Training records confirm annual bloodborne pathogens training for at-risk employees, covering exposure routes, PPE use, and the post-exposure reporting procedure",
    ],
  },
  {
    name: "Flammable & Combustible Liquids",
    description: "OSHA 29 CFR 1910.106 — storage and handling of flammable liquids.",
    items: [
      "Flammable liquids are stored in a listed safety cabinet or approved safety container rated for the specific liquid class and the quantity being stored",
      "The total quantity of flammable liquids stored outside an approved cabinet is measured or estimated and stays within the maximum allowable quantity for this occupancy type",
      "Containers, including safety cans and secondary containers, are labeled with contents and the appropriate flammability hazard warning, not left as unmarked generic cans",
      "A walk of the storage area confirms no smoking materials, open flames, or spark-producing equipment such as unrated electrical or grinding tools are present in or adjacent to the storage location",
      "Spill containment — spill pallets, curbing, or absorbent socks — is staged at the point of storage or dispensing, sized to contain the largest container stored",
      "Storage areas show evidence of adequate ventilation, such as vents, fans, or open-air storage, sufficient to prevent flammable vapors from accumulating to a hazardous concentration",
    ],
  },
  {
    name: "Sanitation & Housekeeping",
    description: "OSHA 29 CFR 1910.141 — sanitation and general housekeeping.",
    items: [
      "Restrooms are clean at the time of inspection, stocked with soap, paper products, and hand-drying capability, with all fixtures — faucets, toilets, locks — in working order",
      "Potable drinking water is available via a fountain, cooler, or bottled supply that employees can access without leaving their work area for an extended period or requesting permission",
      "Waste and trash receptacles are not overflowing, are emptied on a regular schedule, and disposal doesn't create a slip, fire, or pest hazard",
      "Work areas observed are free of accumulated debris, scrap material, or clutter beyond what's needed for the current task",
      "Any evidence of pest activity — droppings, nesting material, insect activity — found during the walkthrough is addressed through an active pest control program, not ignored",
      "Handwashing facilities with soap and running water, or an EPA-registered hand sanitizer where plumbing isn't available, are accessible near work areas where contamination risk exists",
    ],
  },
];

/* ---------------- Store (Airtable-backed) ---------------- */

const Store = {
  async ensureSeeded() {
    const existing = await atListAll("Templates", { "fields[]": "Name" });
    if (existing.length > 0) return false;
    for (const def of TEMPLATE_LIBRARY) {
      await atCreate("Templates", { Name: def.name, Description: def.description, Items: JSON.stringify(def.items.map((text) => ({ id: uid("item"), text }))) });
    }
    return true;
  },

  // ---- Templates ----
  async getTemplates() {
    const records = await atListAll("Templates", { "sort[0][field]": "Name", "sort[0][direction]": "asc" });
    return records.map(fromTemplateRecord);
  },
  async getTemplate(id) {
    const rec = await atGet("Templates", id);
    return rec ? fromTemplateRecord(rec) : null;
  },
  async saveTemplate(tpl) {
    const isNew = !tpl.id;
    const fields = toTemplateFields(tpl);
    const rec = isNew ? await atCreate("Templates", fields) : await atUpdate("Templates", tpl.id, fields);
    if (isNew) tpl.id = rec.id;
    return fromTemplateRecord(rec);
  },
  async deleteTemplate(id) {
    await atDelete("Templates", id);
  },

  // ---- Inspections ----
  async getInspections() {
    const records = await atListAll("Inspections", { "sort[0][field]": "Date", "sort[0][direction]": "desc" });
    return records.map(fromInspectionRecord);
  },
  async getInspection(id) {
    const rec = await atGet("Inspections", id);
    if (!rec) return null;
    const insp = fromInspectionRecord(rec);
    const photosByItem = await Store.getPhotosForInspection(insp.id);
    insp.items.forEach((it) => { it.photos = photosByItem[it.id] || []; });
    return insp;
  },
  async saveInspection(insp) {
    const isNew = !insp.id;
    const fields = toInspectionFields(insp);
    const rec = isNew ? await atCreate("Inspections", fields) : await atUpdate("Inspections", insp.id, fields);
    if (isNew) insp.id = rec.id;
    return rec;
  },
  async deleteInspection(id) {
    const photos = await atListAll("Photos", { filterByFormula: `{InspectionId}='${escapeFormulaValue(id)}'` });
    for (const p of photos) await atDelete("Photos", p.id).catch(() => {});
    const issues = await atListAll("Issues", { filterByFormula: `{InspectionId}='${escapeFormulaValue(id)}'` });
    for (const iss of issues) await atDelete("Issues", iss.id).catch(() => {});
    await atDelete("Inspections", id);
  },

  // ---- Issues ----
  async getIssues() {
    const records = await atListAll("Issues");
    const issues = records.map(fromIssueRecord).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const photosMap = await Store.getFirstPhotoMap();
    issues.forEach((iss) => { iss.photo = photosMap[`${iss.inspectionId}::${iss.itemId}`] || null; });
    return issues;
  },
  async getIssue(id) {
    const rec = await atGet("Issues", id);
    return rec ? fromIssueRecord(rec) : null;
  },
  async saveIssue(issue) {
    const isNew = !issue.id;
    const fields = toIssueFields(issue);
    const rec = isNew ? await atCreate("Issues", fields) : await atUpdate("Issues", issue.id, fields);
    if (isNew) issue.id = rec.id;
    return fromIssueRecord(rec);
  },

  // Syncs open issues to match a completed inspection's failed items:
  // creates a new open issue per newly-failed item, auto-resolves issues
  // whose item is no longer failing, and refreshes text on existing ones.
  async syncIssuesFromInspection(insp) {
    const existing = await atListAll("Issues", { filterByFormula: `{InspectionId}='${escapeFormulaValue(insp.id)}'` });
    const failedItemIds = new Set(insp.items.filter((it) => it.result === "fail").map((it) => it.id));

    for (const rec of existing) {
      if (rec.fields.Status === "open" && !failedItemIds.has(rec.fields.ItemId)) {
        await atUpdate("Issues", rec.id, {
          Status: "resolved",
          ResolvedAt: nowIso(),
          ResolutionNotes: (rec.fields.ResolutionNotes || "") + "\n[Auto-resolved: item no longer marked fail]",
        });
      }
    }

    for (const it of insp.items) {
      if (it.result !== "fail") continue;
      const existingRec = existing.find((r) => r.fields.ItemId === it.id);
      if (existingRec) {
        await atUpdate("Issues", existingRec.id, { ItemText: it.text, Description: it.notes || "" });
      } else {
        await atCreate("Issues", {
          ItemText: it.text,
          InspectionId: insp.id,
          InspectionTitle: insp.title,
          ItemId: it.id,
          Description: it.notes || "",
          Location: insp.location || "",
          Severity: "medium",
          Status: "open",
        });
      }
    }
  },

  // ---- Photos ----
  async getPhotosForInspection(inspectionId) {
    const records = await atListAll("Photos", { filterByFormula: `{InspectionId}='${escapeFormulaValue(inspectionId)}'` });
    const byItem = {};
    records.forEach((rec) => {
      const itemId = rec.fields.ItemId;
      const att = rec.fields.Attachment && rec.fields.Attachment[0];
      if (!att) return;
      (byItem[itemId] = byItem[itemId] || []).push({ photoId: rec.id, url: att.url });
    });
    return byItem;
  },
  async getFirstPhotoMap() {
    const records = await atListAll("Photos");
    const map = {};
    records.forEach((rec) => {
      const key = `${rec.fields.InspectionId}::${rec.fields.ItemId}`;
      if (map[key]) return;
      const att = rec.fields.Attachment && rec.fields.Attachment[0];
      if (att) map[key] = att.url;
    });
    return map;
  },
  async uploadPhoto(inspectionId, itemId, blob) {
    const rec = await atCreate("Photos", { InspectionId: inspectionId, ItemId: itemId });
    const base64 = await blobToBase64(blob);
    const res = await fetch(`https://content.airtable.com/v0/${AIRTABLE_BASE_ID}/${rec.id}/Attachment/uploadAttachment`, {
      method: "POST",
      headers: { Authorization: `Bearer ${airtableToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: "image/jpeg", filename: `${itemId}.jpg`, file: base64 }),
    });
    if (!res.ok) {
      let message = `Airtable upload error ${res.status}`;
      try { const body = await res.json(); message = (body.error && body.error.message) || message; } catch (e) { /* ignore */ }
      await atDelete("Photos", rec.id).catch(() => {});
      throw new Error(message);
    }
    // The content.airtable.com response keys `fields` by field ID rather
    // than name (unlike the regular record API), so re-fetch the record
    // through the normal API to reliably read the attachment back by name.
    const saved = await atGet("Photos", rec.id);
    const att = saved && saved.fields.Attachment && saved.fields.Attachment[0];
    return { photoId: rec.id, url: att ? att.url : "" };
  },
  async deletePhoto(photoId) {
    await atDelete("Photos", photoId);
  },

  // ---- Inspectors / Locations (reusable dropdown lists) ----
  async getInspectors() {
    const records = await atListAll("Inspectors", { "sort[0][field]": "Name", "sort[0][direction]": "asc" });
    return records.map((r) => ({ id: r.id, name: r.fields.Name || "" })).filter((r) => r.name);
  },
  async addInspector(name) {
    const rec = await atCreate("Inspectors", { Name: name });
    return { id: rec.id, name: rec.fields.Name || name };
  },
  async getLocations() {
    const records = await atListAll("Locations", { "sort[0][field]": "Name", "sort[0][direction]": "asc" });
    return records.map((r) => ({ id: r.id, name: r.fields.Name || "" })).filter((r) => r.name);
  },
  async addLocation(name) {
    const rec = await atCreate("Locations", { Name: name });
    return { id: rec.id, name: rec.fields.Name || name };
  },
  async getWorkAreas() {
    const records = await atListAll("Work Areas", { "sort[0][field]": "Name", "sort[0][direction]": "asc" });
    return records.map((r) => ({ id: r.id, name: r.fields.Name || "" })).filter((r) => r.name);
  },
  async addWorkArea(name) {
    const rec = await atCreate("Work Areas", { Name: name });
    return { id: rec.id, name: rec.fields.Name || name };
  },
};

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(blob);
  });
}
