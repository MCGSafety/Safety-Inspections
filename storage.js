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
      "Fire extinguishers are mounted at all required locations, gauges show a full/charged state, and access is not blocked by equipment or storage",
      "Extinguisher inspection tags show a signed inspection within the last 12 months, with no gaps in the inspection history",
      "Fire exits and the path to them are clearly marked with illuminated signage that stays visible even if the lights go out",
      "Routes leading to fire exits are kept clear of furniture, equipment, cords, and stored materials along their full width",
      "Fire alarm pull stations are unobstructed and reachable without moving equipment or furniture",
      "Smoke detectors are present in required areas, show an active status light, and are not painted over or covered",
      "Emergency lighting fixtures activate properly when tested and adequately illuminate the path of egress",
      "Sprinkler heads have at least 18 inches of clearance from stored materials to allow proper water distribution",
    ],
  },
  {
    name: "General Workplace Walkthrough",
    description: "Routine walkthrough covering housekeeping, PPE, and electrical hazards.",
    items: [
      "Walkways and aisles throughout the facility are clear of clutter, cords, and other trip hazards",
      "Any spills or leaks found during the walkthrough have been, or are being, cleaned up promptly",
      "Employees observed during the walkthrough are wearing PPE appropriate to their task and area",
      "Machine guards observed on equipment are in place, secured, and functioning as intended",
      "Electrical panels throughout the facility maintain the required 36 inches of clear working space",
      "Extension cords in use are in good condition, not run through doorways, and not daisy-chained together",
      "A stocked first aid kit is accessible and its contents are within their expiration dates",
      "Eyewash stations are unobstructed, and a quick activation test confirms the water flow is functional",
      "Chemical containers throughout the area are properly labeled with contents and hazard information",
      "The SDS binder (or electronic equivalent) is accessible to employees and reflects the chemicals currently on-site",
    ],
  },
  {
    name: "Walking-Working Surfaces",
    description: "OSHA 29 CFR 1910 Subpart D — floors, aisles, stairways, elevated surfaces.",
    items: [
      "Floors are clean, dry, and free of holes, loose boards, or other trip and fall hazards",
      "Aisles and walkways are clearly marked with striping or signage and kept clear of stored material or equipment",
      "Spills and leaks are cleaned up as soon as they're found, with wet-floor signage posted until the area is fully dry",
      "Floor openings and holes are covered with load-rated covers or guarded by railings on all exposed sides",
      "Guardrails are installed on elevated platforms and open-sided floors 4 feet or more above the level below",
      "Stairways have secure handrails on at least one side and are kept clear of stored items or debris",
      "Floor load limits are posted in areas where storage or equipment could exceed the structure's rated capacity",
      "Non-slip mats or coatings are used in areas that are routinely wet, greasy, or otherwise slippery",
    ],
  },
  {
    name: "Means of Egress & Exit Routes",
    description: "OSHA 29 CFR 1910.34–1910.39 — exit routes and emergency egress.",
    items: [
      "Exit routes are permanently marked with illuminated exit signs visible from anywhere along the route",
      "At least two remote exit routes are available from areas where a single blocked exit could trap employees",
      "Exit doors are unlocked from the inside and can be opened without a key, tool, or special knowledge",
      "Exit routes are kept clear of storage, equipment, and other obstructions along their entire width",
      "Maps showing evacuation routes and assembly points are posted in visible locations throughout the workplace",
      "Doors located along the exit route swing in the direction of exit travel where the occupant load requires it",
      "The exit discharge leads directly to a public way, street, or other open area recognized as a safe refuge",
    ],
  },
  {
    name: "Emergency Action Plan",
    description: "OSHA 29 CFR 1910.38 — emergency and evacuation planning.",
    items: [
      "A written emergency action plan is available on-site and covers the emergency scenarios relevant to this facility",
      "Evacuation routes and designated assembly points have actually been communicated to employees, not just posted",
      "Employees have received training on emergency procedures, including their specific role during an evacuation",
      "The alarm system is audible and/or visible throughout the facility, including in high-noise or isolated areas",
      "Specific employees are designated and trained to assist others during an evacuation, including anyone needing extra help",
      "Emergency contact numbers are posted in a visible, easily accessible location",
      "The emergency action plan has been reviewed and updated within the last 12 months to reflect current operations",
    ],
  },
  {
    name: "Hazard Communication (GHS)",
    description: "OSHA 29 CFR 1910.1200 — chemical labeling, SDS, and training.",
    items: [
      "A written Hazard Communication Program is available on-site and reflects the chemicals currently in use",
      "Safety Data Sheets are accessible to employees for every hazardous chemical present, without needing supervisor approval to view them",
      "Chemical containers are labeled with the product identifier and GHS hazard pictograms/warnings matching the SDS",
      "New employees receive hazard communication training, covering chemical hazards and label/SDS interpretation, before working with hazardous chemicals",
      "Secondary containers, such as spray bottles or smaller containers decanted from bulk, are labeled with contents and hazard information rather than left blank",
      "The chemical inventory list is current and reflects the chemicals actually stored and used on-site",
    ],
  },
  {
    name: "Personal Protective Equipment (PPE)",
    description: "OSHA 29 CFR 1910 Subpart I — PPE assessment, availability, and use.",
    items: [
      "A documented hazard assessment has been completed to identify which PPE is required for each task or area",
      "Required PPE is stocked in appropriate sizes, in good condition, and readily available to the employees who need it",
      "Employees are observed wearing the correct PPE, worn correctly, for the tasks and areas that require it",
      "PPE is inspected on a regular schedule for cracks, wear, or damage that would reduce its protection",
      "Eye and face protection meeting the applicable standard is provided and worn wherever there's risk of flying particles, chemicals, or radiation",
      "Hand protection is matched to the specific hazard of the task — cut, chemical, thermal, etc. — rather than a one-size-fits-all glove",
      "Records of PPE training are current for every employee required to use PPE",
    ],
  },
  {
    name: "Electrical Safety",
    description: "OSHA 29 CFR 1910 Subpart S — wiring, panels, and equipment grounding.",
    items: [
      "Electrical panels and disconnects have at least 36 inches of clear working space maintained in front of them, per code",
      "Panels are labeled with a legible, up-to-date circuit directory identifying what each breaker controls",
      "Wiring and cords show no exposed conductors, cracked insulation, or other visible damage",
      "GFCI protection is provided for outlets in wet locations, outdoors, and other areas where it's required",
      "Extension cords are used only for temporary purposes, never as a substitute for permanent building wiring",
      "All outlets and switches have intact cover plates with no exposed wiring behind them",
      "Equipment and tools are properly grounded, with grounding prongs intact and not removed or defeated",
    ],
  },
  {
    name: "Machine Guarding",
    description: "OSHA 29 CFR 1910.212 — guarding of machinery and moving parts.",
    items: [
      "Point-of-operation guards are installed and in place on every machine where operators could contact moving parts",
      "Belts, pulleys, gears, and other power transmission parts are fully enclosed or guarded",
      "No machine guards have been removed, propped open, or bypassed to speed up production",
      "Emergency stop controls are unobstructed, clearly marked, and confirmed to actually stop the machine when tested",
      "Machines are anchored or otherwise secured so they cannot walk, tip, or shift during normal operation",
      "Warning signage is posted on machinery with pinch points, rotating parts, or other non-obvious hazards",
    ],
  },
  {
    name: "Lockout/Tagout (Control of Hazardous Energy)",
    description: "OSHA 29 CFR 1910.147 — energy control procedures.",
    items: [
      "A written energy control (lockout/tagout) program is documented and readily accessible to all authorized employees",
      "Machine-specific lockout/tagout procedures are documented for each piece of equipment, including all energy sources and isolation points",
      "Lockout devices — locks, tags, chains, blocks — are available in sufficient quantity for every energy source on-site",
      "All employees who service or maintain equipment are trained and formally authorized to perform lockout/tagout procedures",
      "Periodic inspections of lockout/tagout procedures are conducted at least annually by an authorized employee not involved in the procedure being reviewed",
      "Locks and tags are in good condition, clearly identify the employee who applied them, and are removed only by that employee",
    ],
  },
  {
    name: "Materials Handling & Storage",
    description: "OSHA 29 CFR 1910 Subpart N — storage, stacking, and manual handling.",
    items: [
      "Stored materials are stacked, blocked, or racked in a way that prevents sliding, falling, or collapsing",
      "Storage racks show no visible damage, such as bent frames or missing pins, and are not loaded beyond their rated capacity",
      "Aisles between storage areas are wide enough for the material handling equipment actually used to move through safely",
      "Heavier or bulkier items are stored on lower shelves, with lighter items placed higher up",
      "Mechanical lifting aids, such as hand trucks or hoists, are available and used for loads that shouldn't be lifted manually",
      "Stacked or stored materials do not block sprinkler heads, electrical panels, fire extinguishers, or exit routes",
    ],
  },
  {
    name: "Powered Industrial Trucks (Forklifts)",
    description: "OSHA 29 CFR 1910.178 — forklift operation and maintenance.",
    items: [
      "All forklift operators hold current certification and have completed both classroom and hands-on training",
      "A documented pre-operation inspection is completed and recorded before each shift a forklift is used",
      "The horn, headlights/taillights, and backup alarm are all tested and functioning correctly",
      "The data plate showing rated load capacity is present, legible, and matches the attachment currently installed",
      "Forks and attachments show no cracks, excessive wear, or bending that would compromise load capacity",
      "Battery charging or fuel storage areas are properly ventilated and equipped with appropriate fire protection",
      "Pedestrian walkways are physically separated from forklift travel paths, with clear signage at crossing points",
    ],
  },
  {
    name: "Ladders",
    description: "OSHA 29 CFR 1910.23 — portable and fixed ladder safety.",
    items: [
      "Ladders show no visible damage — no cracked rails, missing rungs, or loose hardware",
      "Each ladder in use is rated to safely support the combined weight of the worker, tools, and materials for the task",
      "Ladders are visually inspected for defects before each use, not just on a periodic schedule",
      "Extension ladders are set at the proper 4:1 angle — 1 foot of base offset for every 4 feet of working height",
      "Ladders are secured at the top, tied off, or footed by another employee to prevent slipping",
      "Any ladder found damaged is immediately tagged \"Do Not Use\" and removed from service until repaired or replaced",
    ],
  },
  {
    name: "Welding, Cutting & Brazing",
    description: "OSHA 29 CFR 1910 Subpart Q — hot work safety.",
    items: [
      "A dedicated fire watch is posted during and for at least 30 minutes after hot work where combustibles are nearby",
      "All combustible materials are moved at least 35 feet from the hot work area, or otherwise shielded",
      "Welding screens or curtains are in place to protect nearby workers from arc flash and sparks",
      "Welders are wearing the correct PPE for the process — a helmet with the proper shade lens, flame-resistant gloves, and a protective apron",
      "A charged fire extinguisher rated for the hazard is staged within immediate reach of the hot work location",
      "Compressed gas cylinders used for the work are secured upright with valve protection in place when not connected",
      "Ventilation, natural or mechanical, is adequate to keep welding fumes and gases below exposure limits",
    ],
  },
  {
    name: "Compressed Gas Cylinders",
    description: "OSHA 29 CFR 1910.101 — storage and handling of compressed gas.",
    items: [
      "All compressed gas cylinders, in use or storage, are secured in an upright position with a chain or strap to prevent tipping",
      "Valve protection caps are in place on all cylinders that are not currently connected for use",
      "Cylinders are stored at least 20 feet from heat sources, open flames, and other ignition sources",
      "Oxygen cylinders are stored at least 20 feet from fuel-gas cylinders, or separated by a fire-rated barrier at least 5 feet high",
      "Each cylinder is clearly labeled with its contents so hazards can be identified without opening the valve",
      "Empty and full cylinders are segregated and clearly marked to prevent accidental use of an empty cylinder",
    ],
  },
  {
    name: "Confined Space Entry",
    description: "OSHA 29 CFR 1910.146 — permit-required confined spaces.",
    items: [
      "Confined spaces in the facility are identified and labeled with appropriate warning signage",
      "A written permit-required confined space program is in place and reflects the spaces actually present on-site",
      "Atmospheric testing for oxygen, flammability, and toxicity is performed and documented before each entry",
      "A completed entry permit is on file for every confined space entry, specifying hazards and controls",
      "A trained attendant remains stationed outside the space and in communication with entrants for the entire entry",
      "A rescue plan and the equipment needed to execute it are available and staged before entry begins",
      "Employees who enter confined spaces have been trained on the specific hazards of those spaces",
    ],
  },
  {
    name: "Respiratory Protection",
    description: "OSHA 29 CFR 1910.134 — respirator selection, use, and maintenance.",
    items: [
      "A written respiratory protection program is in place and covers the respirators actually used on-site",
      "Employees who wear respirators have a current medical evaluation and have passed a fit test for their specific respirator model",
      "The respirator provided matches the specific hazard and exposure level of the task, such as particulates versus organic vapors",
      "Respirators are cleaned after use, stored in a way that prevents contamination or damage, and inspected before each use",
      "Cartridges and filters are replaced on the schedule specified by the manufacturer or program, not left in use indefinitely",
      "Employees have been trained on proper donning, doffing, use, and the limitations of their assigned respirator",
    ],
  },
  {
    name: "Hearing Conservation",
    description: "OSHA 29 CFR 1910.95 — noise exposure and hearing protection.",
    items: [
      "Noise levels in high-noise areas have been measured and documented within the applicable monitoring interval",
      "Hearing protection is available at or near the entrance to any area where noise exceeds the action level",
      "Employees enrolled in the hearing conservation program have received an audiogram within the last year",
      "Employees in high-noise areas are observed wearing hearing protection correctly — fully inserted or properly fitted",
      "Warning signage indicating hearing protection is required is posted at the entrance to high-noise areas",
    ],
  },
  {
    name: "Bloodborne Pathogens",
    description: "OSHA 29 CFR 1910.1030 — exposure control and first aid.",
    items: [
      "A written bloodborne pathogens exposure control plan is available and has been reviewed or updated within the last year",
      "Sharps containers are puncture-resistant, labeled, accessible at the point of use, and not filled beyond the fill line",
      "Gloves and other PPE for handling blood or other potentially infectious materials are stocked and readily available",
      "Hepatitis B vaccination has been offered at no cost to all employees with reasonably anticipated occupational exposure",
      "Spill kits for cleaning up blood or bodily fluids are stocked and stored in an accessible, clearly known location",
      "Employees with occupational exposure risk have completed bloodborne pathogens exposure control training",
    ],
  },
  {
    name: "Flammable & Combustible Liquids",
    description: "OSHA 29 CFR 1910.106 — storage and handling of flammable liquids.",
    items: [
      "Flammable liquids are stored in approved safety cabinets or containers rated for the quantity and type stored",
      "Quantities of flammable liquids stored outside approved cabinets stay within the allowable limits for the occupancy",
      "Containers are labeled with contents and appropriate hazard warnings, including safety cans and secondary containers",
      "No smoking, open flames, or other ignition sources are present in or near flammable liquid storage areas",
      "Spill containment, such as curbing, drip pans, or absorbent materials, is available wherever flammable liquids are stored or dispensed",
      "Storage areas have adequate ventilation to prevent the buildup of flammable vapors",
    ],
  },
  {
    name: "Sanitation & Housekeeping",
    description: "OSHA 29 CFR 1910.141 — sanitation and general housekeeping.",
    items: [
      "Restrooms are clean, fully stocked with supplies, and all fixtures are in working order",
      "Potable drinking water is available and easily accessible to employees throughout their shift",
      "Waste and trash are collected regularly and disposed of in a way that doesn't create a hazard",
      "Work areas are kept clean and free of accumulated debris, scrap, or unnecessary clutter",
      "Pest control measures are in place and any evidence of pest activity is addressed promptly",
      "Handwashing facilities with soap and running water, or an equivalent, are available and accessible to employees",
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
