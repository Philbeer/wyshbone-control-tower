import type { StopReason } from "./towerVerdict";

export interface ReceiptDeliveredLead {
  name: string;
  place_id?: string;
  [key: string]: unknown;
}

export interface ReceiptPayload {
  requested_count?: number;
  delivered_count?: number;
  delivered_leads?: ReceiptDeliveredLead[];
  contacts_proven?: boolean;
  unique_email_count?: number | null;
  unique_phone_count?: number | null;
  narrative_lines?: string[];
  websites_checked_count?: number;
  contact_extraction_attempted_count?: number;
  [key: string]: unknown;
}

export interface SiblingArtefact {
  id: string;
  artefact_type: string;
  payload_json: any;
}

export interface ReceiptTruthMetrics {
  tower_computed_emails: number;
  tower_computed_phones: number;
  receipt_email_count: number | null;
  receipt_phone_count: number | null;
  matching_reliable: boolean;
  matched_artefact_ids: string[];
  rule_results: Record<string, { passed: boolean; reason?: string }>;
}

export interface ReceiptJudgement {
  verdict: "ACCEPT" | "RETRY" | "STOP";
  reasons: string[];
  metrics: ReceiptTruthMetrics;
  stop_reason?: StopReason | null;
}

const ABSENCE_PHRASES = [
  "found 0 emails",
  "found 0 phones",
  "couldn't find any emails",
  "couldn't find any phones",
  "could not find any emails",
  "could not find any phones",
  "no emails",
  "no phones",
  "no email",
  "no phone",
  "0 emails",
  "0 phones",
  "no contact info",
  "no contact information",
  "no contacts found",
  "no contacts were found",
  "no emails were found",
  "no phones were found",
  "no emails were located",
  "no phones were located",
  "zero emails",
  "zero phones",
  "didn't find any emails",
  "didn't find any phones",
  "did not find any emails",
  "did not find any phones",
  "without any emails",
  "without any phones",
];

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function extractContactsFromLeadPack(payload: any, deliveredLeads: ReceiptDeliveredLead[]): {
  emails: Set<string>;
  phones: Set<string>;
  matched: boolean;
} {
  const emails = new Set<string>();
  const phones = new Set<string>();
  let matched = false;

  const leadPack = payload?.outputs?.lead_pack;
  if (!leadPack) return { emails, phones, matched: false };

  const placeIdSet = new Set(deliveredLeads.filter(l => l.place_id).map(l => l.place_id!));
  const nameSet = new Set(deliveredLeads.map(l => normalizeName(l.name)));

  const artPlaceId = payload?.place_id ?? leadPack?.place_id;
  const artName = payload?.name ?? leadPack?.name;

  if (artPlaceId && placeIdSet.has(artPlaceId)) {
    matched = true;
  } else if (artName && nameSet.has(normalizeName(artName))) {
    matched = true;
  } else if (!artPlaceId && !artName) {
    matched = true;
  }

  if (!matched) return { emails, phones, matched: false };

  const contactEmails = leadPack.contacts?.emails;
  if (Array.isArray(contactEmails)) {
    for (const e of contactEmails) {
      const val = typeof e === "string" ? e : e?.value;
      if (typeof val === "string" && val.length > 0) {
        emails.add(val.toLowerCase().trim());
      }
    }
  }

  const contactPhones = leadPack.contacts?.phones;
  if (Array.isArray(contactPhones)) {
    for (const p of contactPhones) {
      const val = typeof p === "string" ? p : p?.value;
      if (typeof val === "string" && val.length > 0) {
        phones.add(val.trim());
      }
    }
  }

  return { emails, phones, matched };
}

function extractContactsFromContactExtract(payload: any, deliveredLeads: ReceiptDeliveredLead[]): {
  emails: Set<string>;
  phones: Set<string>;
  matched: boolean;
} {
  const emails = new Set<string>();
  const phones = new Set<string>();
  let matched = false;

  const contacts = payload?.outputs?.contacts;
  if (!contacts) return { emails, phones, matched: false };

  const placeIdSet = new Set(deliveredLeads.filter(l => l.place_id).map(l => l.place_id!));
  const nameSet = new Set(deliveredLeads.map(l => normalizeName(l.name)));

  const artPlaceId = payload?.place_id;
  const artName = payload?.name;

  if (artPlaceId && placeIdSet.has(artPlaceId)) {
    matched = true;
  } else if (artName && nameSet.has(normalizeName(artName))) {
    matched = true;
  } else if (!artPlaceId && !artName) {
    matched = true;
  }

  if (!matched) return { emails, phones, matched: false };

  if (Array.isArray(contacts.emails)) {
    for (const e of contacts.emails) {
      if (typeof e === "string" && e.length > 0) {
        emails.add(e.toLowerCase().trim());
      }
    }
  }

  if (Array.isArray(contacts.phones)) {
    for (const p of contacts.phones) {
      if (typeof p === "string" && p.length > 0) {
        phones.add(p.trim());
      }
    }
  }

  return { emails, phones, matched };
}

export function computeReceiptTruth(
  deliveredLeads: ReceiptDeliveredLead[],
  siblingArtefacts: SiblingArtefact[]
): {
  uniqueEmails: number;
  uniquePhones: number;
  matchingReliable: boolean;
  matchedArtefactIds: string[];
} {
  const allEmails = new Set<string>();
  const allPhones = new Set<string>();
  const matchedIds: string[] = [];
  let anyMatchFailed = false;

  for (const art of siblingArtefacts) {
    if (art.artefact_type === "lead_pack") {
      const result = extractContactsFromLeadPack(art.payload_json, deliveredLeads);
      if (result.matched) {
        result.emails.forEach(e => allEmails.add(e));
        result.phones.forEach(p => allPhones.add(p));
        matchedIds.push(art.id);
      } else {
        anyMatchFailed = true;
      }
    } else if (art.artefact_type === "contact_extract") {
      const result = extractContactsFromContactExtract(art.payload_json, deliveredLeads);
      if (result.matched) {
        result.emails.forEach(e => allEmails.add(e));
        result.phones.forEach(p => allPhones.add(p));
        matchedIds.push(art.id);
      } else {
        anyMatchFailed = true;
      }
    }
  }

  const contactArtefactCount = siblingArtefacts.filter(
    a => a.artefact_type === "lead_pack" || a.artefact_type === "contact_extract"
  ).length;
  const matchingReliable = contactArtefactCount === 0 || !anyMatchFailed;

  return {
    uniqueEmails: allEmails.size,
    uniquePhones: allPhones.size,
    matchingReliable,
    matchedArtefactIds: matchedIds,
  };
}

export function judgeRunReceipt(
  receipt: ReceiptPayload,
  siblingArtefacts: SiblingArtefact[]
): ReceiptJudgement {
  const reasons: string[] = [];
  const ruleResults: Record<string, { passed: boolean; reason?: string }> = {};
  let finalVerdict: "ACCEPT" | "RETRY" | "STOP" = "ACCEPT";

  function failRule(ruleId: string, reason: string, verdict: "RETRY" | "STOP" = "STOP") {
    ruleResults[ruleId] = { passed: false, reason };
    reasons.push(reason);
    if (verdict === "STOP" || finalVerdict !== "STOP") {
      finalVerdict = verdict;
    }
  }

  function passRule(ruleId: string) {
    ruleResults[ruleId] = { passed: true };
  }

  const deliveredLeads = receipt.delivered_leads ?? [];

  if (typeof receipt.requested_count !== "number" || !isFinite(receipt.requested_count)) {
    failRule("A", "requested_count is not a finite number");
  } else if (typeof receipt.delivered_count !== "number" || !isFinite(receipt.delivered_count)) {
    failRule("A", "delivered_count is not a finite number");
  } else if (receipt.delivered_count !== deliveredLeads.length) {
    failRule("A", `delivered_count (${receipt.delivered_count}) does not match delivered_leads.length (${deliveredLeads.length})`);
  } else {
    passRule("A");
  }

  const narrativeLines = receipt.narrative_lines ?? [];
  const narrativeText = narrativeLines.join(" ").toLowerCase();

  if (receipt.contacts_proven === false) {
    let ruleB_passed = true;

    if (receipt.unique_email_count !== null && receipt.unique_email_count !== undefined) {
      failRule("B", "contacts_proven=false but unique_email_count is not null");
      ruleB_passed = false;
    }
    if (receipt.unique_phone_count !== null && receipt.unique_phone_count !== undefined) {
      failRule("B", "contacts_proven=false but unique_phone_count is not null");
      ruleB_passed = false;
    }

    for (const phrase of ABSENCE_PHRASES) {
      if (narrativeText.includes(phrase)) {
        failRule("B", `Receipt claims absence without proof: narrative contains "${phrase}"`);
        ruleB_passed = false;
        break;
      }
    }

    if (ruleB_passed) {
      passRule("B");
    }
  } else if (receipt.contacts_proven === true) {
    if (typeof receipt.unique_email_count !== "number") {
      failRule("B", "contacts_proven=true but unique_email_count is not a number");
    } else if (typeof receipt.unique_phone_count !== "number") {
      failRule("B", "contacts_proven=true but unique_phone_count is not a number");
    } else {
      passRule("B");
    }
  } else {
    passRule("B");
  }

  const truth = computeReceiptTruth(deliveredLeads, siblingArtefacts);

  if (receipt.contacts_proven === true) {
    if (truth.matchingReliable) {
      const emailMatch = receipt.unique_email_count === truth.uniqueEmails;
      const phoneMatch = receipt.unique_phone_count === truth.uniquePhones;

      if (!emailMatch || !phoneMatch) {
        failRule("C",
          `Contact count mismatch: receipt says emails=${receipt.unique_email_count} phones=${receipt.unique_phone_count}, ` +
          `Tower computed emails=${truth.uniqueEmails} phones=${truth.uniquePhones}`
        );
      } else {
        passRule("C");
      }
    } else {
      failRule("D",
        "Cannot reliably match contact artefacts to delivered leads but contacts_proven=true. " +
        "Receipt must set contacts_proven=false, counts to null, and use safe narrative wording."
      );
    }
  } else if (receipt.contacts_proven === false) {
    if (!truth.matchingReliable) {
      passRule("D");
    } else {
      passRule("D");
    }
    passRule("C");
  } else {
    passRule("C");
    passRule("D");
  }

  if (receipt.websites_checked_count !== undefined || receipt.contact_extraction_attempted_count !== undefined) {
    let ruleE_passed = true;
    const dc = deliveredLeads.length;

    if (typeof receipt.websites_checked_count === "number") {
      if (receipt.websites_checked_count < 0 || receipt.websites_checked_count > dc * 10) {
        failRule("E", `websites_checked_count (${receipt.websites_checked_count}) is not sane relative to delivered_count (${dc})`);
        ruleE_passed = false;
      }
    }

    if (typeof receipt.contact_extraction_attempted_count === "number") {
      if (receipt.contact_extraction_attempted_count < 0 || receipt.contact_extraction_attempted_count > dc * 10) {
        failRule("E", `contact_extraction_attempted_count (${receipt.contact_extraction_attempted_count}) is not sane relative to delivered_count (${dc})`);
        ruleE_passed = false;
      }
    }

    if (ruleE_passed) {
      passRule("E");
    }
  } else {
    passRule("E");
  }

  const allPassed = Object.values(ruleResults).every(r => r.passed);
  if (allPassed) {
    finalVerdict = "ACCEPT";
  }

  const metrics: ReceiptTruthMetrics = {
    tower_computed_emails: truth.uniqueEmails,
    tower_computed_phones: truth.uniquePhones,
    receipt_email_count: receipt.unique_email_count ?? null,
    receipt_phone_count: receipt.unique_phone_count ?? null,
    matching_reliable: truth.matchingReliable,
    matched_artefact_ids: truth.matchedArtefactIds,
    rule_results: ruleResults,
  };

  const stopReason: StopReason | null = finalVerdict !== "ACCEPT"
    ? {
        code: "RECEIPT_TRUTH_FAILED",
        message: reasons[0] ?? "Receipt truth check failed",
        evidence: {
          failed_rules: Object.entries(ruleResults)
            .filter(([, r]) => !r.passed)
            .map(([id, r]) => ({ rule: id, reason: r.reason })),
        },
      }
    : null;

  return {
    verdict: finalVerdict,
    reasons: allPassed ? ["All receipt truth checks passed"] : reasons,
    metrics,
    stop_reason: stopReason,
  };
}
