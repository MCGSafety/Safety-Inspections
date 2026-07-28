/* Data layer: Airtable-backed store shared across every device that has a
   Personal Access Token for the SafeCheck base (see config.js for the base
   ID). Uses the Airtable REST API directly via fetch — no client library
   needed. */

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
      "Fire extinguishers present, charged, and unobstructed",
      "Extinguisher inspection tags current (within last 12 months)",
      "Fire exits clearly marked and illuminated",
      "Exit routes free of obstructions",
      "Fire alarm pull stations accessible and unobstructed",
      "Smoke detectors present and appear functional",
      "Emergency lighting operational",
      "Sprinkler heads unobstructed (18in clearance)",
    ],
  },
  {
    name: "General Workplace Walkthrough",
    description: "Routine walkthrough covering housekeeping, PPE, and electrical hazards.",
    items: [
      "Walkways and aisles clear of clutter and trip hazards",
      "Spills or leaks cleaned up promptly",
      "PPE available and in use where required",
      "Machine guards in place and functional",
      "Electrical panels unobstructed (36in clearance)",
      "Extension cords in good condition, not daisy-chained",
      "First aid kit stocked and accessible",
      "Eyewash station accessible and functional",
      "Chemical containers properly labeled",
      "SDS binder accessible and up to date",
    ],
  },
  {
    name: "Walking-Working Surfaces",
    description: "OSHA 29 CFR 1910 Subpart D — floors, aisles, stairways, elevated surfaces.",
    items: [
      "Floors clean, dry, and free of holes or damaged boards",
      "Aisles and walkways clearly marked and unobstructed",
      "Spills cleaned up immediately with wet-floor signage posted",
      "Floor openings and holes covered or guarded",
      "Guardrails installed on elevated platforms and open-sided floors (4ft+)",
      "Stairways have secure handrails and are free of clutter",
      "Floor load limits posted where required",
      "Non-slip surfaces or mats used in wet/slippery areas",
    ],
  },
  {
    name: "Means of Egress & Exit Routes",
    description: "OSHA 29 CFR 1910.34–1910.39 — exit routes and emergency egress.",
    items: [
      "Exit routes permanently marked and illuminated",
      "Minimum of two exit routes available where required",
      "Exit doors unlocked and openable from inside without keys or tools",
      "Exit routes free of obstructions and stored materials",
      "Exit route maps posted and visible to employees",
      "Doors along exit route swing in the direction of travel where required",
      "Exit discharge leads to a public way or safe area",
    ],
  },
  {
    name: "Emergency Action Plan",
    description: "OSHA 29 CFR 1910.38 — emergency and evacuation planning.",
    items: [
      "Written emergency action plan available and accessible",
      "Evacuation routes and assembly points communicated to employees",
      "Employees trained on emergency procedures",
      "Alarm system audible and/or visible throughout the facility",
      "Designated employees assigned to assist in evacuation",
      "Emergency contact numbers posted",
      "Plan reviewed or updated within the last 12 months",
    ],
  },
  {
    name: "Hazard Communication (GHS)",
    description: "OSHA 29 CFR 1910.1200 — chemical labeling, SDS, and training.",
    items: [
      "Written Hazard Communication Program available",
      "Safety Data Sheets (SDS) accessible for all hazardous chemicals",
      "Containers labeled with product identifier and hazard warnings",
      "Employees trained on chemical hazards before initial assignment",
      "Secondary containers properly labeled",
      "Chemical inventory list current",
    ],
  },
  {
    name: "Personal Protective Equipment (PPE)",
    description: "OSHA 29 CFR 1910 Subpart I — PPE assessment, availability, and use.",
    items: [
      "PPE hazard assessment completed and documented",
      "Required PPE available and in good condition",
      "Employees wearing required PPE correctly",
      "PPE inspected regularly for damage or wear",
      "Eye and face protection provided where needed",
      "Hand protection appropriate for the task",
      "PPE training records up to date",
    ],
  },
  {
    name: "Electrical Safety",
    description: "OSHA 29 CFR 1910 Subpart S — wiring, panels, and equipment grounding.",
    items: [
      "Electrical panels and disconnects accessible (36in clearance)",
      "Panels labeled and circuits identified",
      "No exposed wiring or damaged cords",
      "GFCI protection provided in wet locations",
      "Extension cords used only temporarily, not as permanent wiring",
      "Outlets and switches have cover plates",
      "Equipment properly grounded",
    ],
  },
  {
    name: "Machine Guarding",
    description: "OSHA 29 CFR 1910.212 — guarding of machinery and moving parts.",
    items: [
      "Point-of-operation guards in place on all machines",
      "Belts, pulleys, and gears guarded",
      "Machine guards not removed or bypassed",
      "Emergency stop controls accessible and functional",
      "Machines anchored or secured to prevent movement",
      "Warning signs posted on hazardous machinery",
    ],
  },
  {
    name: "Lockout/Tagout (Control of Hazardous Energy)",
    description: "OSHA 29 CFR 1910.147 — energy control procedures.",
    items: [
      "Written energy control (LOTO) program in place",
      "Machine-specific LOTO procedures documented",
      "Lockout devices available for all energy sources",
      "Employees trained and authorized for LOTO",
      "Periodic LOTO procedure inspections conducted (at least annually)",
      "Locks and tags in good condition and properly used",
    ],
  },
  {
    name: "Materials Handling & Storage",
    description: "OSHA 29 CFR 1910 Subpart N — storage, stacking, and manual handling.",
    items: [
      "Materials stacked and stored to prevent tipping or collapse",
      "Storage racks in good condition and not overloaded",
      "Aisles wide enough for safe material movement",
      "Heavy items stored on lower shelves",
      "Mechanical lifting aids available and used where appropriate",
      "Stacked materials do not block sprinklers, exits, or panels",
    ],
  },
  {
    name: "Powered Industrial Trucks (Forklifts)",
    description: "OSHA 29 CFR 1910.178 — forklift operation and maintenance.",
    items: [
      "Operators certified and trained",
      "Daily pre-operation inspection completed and documented",
      "Horn, lights, and backup alarm functional",
      "Load capacity plate visible and legible",
      "Forks and attachments in good condition",
      "Charging/fueling area properly ventilated",
      "Pedestrian walkways separated from forklift traffic",
    ],
  },
  {
    name: "Ladders",
    description: "OSHA 29 CFR 1910.23 — portable and fixed ladder safety.",
    items: [
      "Ladders free of visible damage or defects",
      "Ladders rated for the load and task",
      "Ladders inspected before each use",
      "Proper 4:1 angle maintained for extension ladders",
      "Ladders secured or footed to prevent slipping",
      "Damaged ladders tagged out of service and removed",
    ],
  },
  {
    name: "Welding, Cutting & Brazing",
    description: "OSHA 29 CFR 1910 Subpart Q — hot work safety.",
    items: [
      "Fire watch posted during hot work where required",
      "Combustibles cleared from welding area (35ft)",
      "Welding screens or curtains used to protect others",
      "PPE (helmet, gloves, apron) worn correctly",
      "Fire extinguisher readily available at hot work site",
      "Gas cylinders secured upright with valves protected",
      "Ventilation adequate for fumes and gases",
    ],
  },
  {
    name: "Compressed Gas Cylinders",
    description: "OSHA 29 CFR 1910.101 — storage and handling of compressed gas.",
    items: [
      "Cylinders secured upright with chain or strap",
      "Valve caps in place when not in use",
      "Cylinders stored away from heat and ignition sources",
      "Oxygen and fuel gas cylinders stored separately (20ft or fire barrier)",
      "Cylinders labeled with contents",
      "Empty and full cylinders segregated and marked",
    ],
  },
  {
    name: "Confined Space Entry",
    description: "OSHA 29 CFR 1910.146 — permit-required confined spaces.",
    items: [
      "Confined spaces identified and labeled",
      "Permit-required confined space program in place",
      "Atmospheric testing performed before entry",
      "Entry permits completed for each entry",
      "Attendant present during entry operations",
      "Rescue plan and equipment available",
      "Entrants trained on confined space hazards",
    ],
  },
  {
    name: "Respiratory Protection",
    description: "OSHA 29 CFR 1910.134 — respirator selection, use, and maintenance.",
    items: [
      "Written respiratory protection program in place",
      "Employees medically evaluated and fit-tested",
      "Respirators appropriate for the hazard",
      "Respirators cleaned, stored, and inspected properly",
      "Cartridges/filters replaced per schedule",
      "Employees trained on proper use and limitations",
    ],
  },
  {
    name: "Hearing Conservation",
    description: "OSHA 29 CFR 1910.95 — noise exposure and hearing protection.",
    items: [
      "Noise levels monitored in high-noise areas",
      "Hearing protection available where noise exceeds the action level",
      "Employees in hearing conservation program receive annual audiograms",
      "Hearing protection worn correctly by employees",
      "Warning signs posted in high-noise areas",
    ],
  },
  {
    name: "Bloodborne Pathogens",
    description: "OSHA 29 CFR 1910.1030 — exposure control and first aid.",
    items: [
      "Exposure control plan available and current",
      "Sharps containers available and not overfilled",
      "PPE (gloves, etc.) available for handling blood/body fluids",
      "Hepatitis B vaccination offered to at-risk employees",
      "Spill kits available for bodily fluid cleanup",
      "Employees trained on exposure control procedures",
    ],
  },
  {
    name: "Flammable & Combustible Liquids",
    description: "OSHA 29 CFR 1910.106 — storage and handling of flammable liquids.",
    items: [
      "Flammable liquids stored in approved cabinets/containers",
      "Storage quantities within allowable limits",
      "Containers properly labeled",
      "No smoking or ignition sources near storage areas",
      "Spill containment available where needed",
      "Ventilation adequate in storage areas",
    ],
  },
  {
    name: "Sanitation & Housekeeping",
    description: "OSHA 29 CFR 1910.141 — sanitation and general housekeeping.",
    items: [
      "Restrooms clean, stocked, and in working order",
      "Potable drinking water available and accessible",
      "Waste properly collected and disposed of",
      "Work areas kept clean and free of debris",
      "Pest control measures in place",
      "Handwashing facilities available",
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
};

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(blob);
  });
}
