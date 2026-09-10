function required_(value, label) {
  if (value == null || String(value).trim() === '') throw new Error(label + 'は必須です。');
}

function normalizeList_(value) {
  if (Array.isArray(value)) return value.map(String).map(item => item.trim()).filter(Boolean);
  return value == null || String(value).trim() === '' ? [] : [String(value).trim()];
}

function assertInputComplexity_(value, limits, label) {
  const seen = [];
  let propertyCount = 0;
  function visit(item, depth) {
    if (depth > limits.maxDepth) throw new Error(label + 'の階層が深すぎます。');
    if (item == null || typeof item === 'string' || typeof item === 'boolean' || typeof item === 'number') return;
    if (item instanceof Date) return;
    if (typeof item !== 'object') throw new Error(label + 'に使用できない値があります。');
    if (seen.indexOf(item) >= 0) throw new Error(label + 'に循環参照があります。');
    seen.push(item);
    if (Array.isArray(item)) {
      if (item.length > limits.maxArrayItems) throw new Error(label + 'の配列件数が上限を超えています。');
      item.forEach(function(child) { visit(child, depth + 1); });
    } else {
      const keys = Object.keys(item);
      propertyCount += keys.length;
      if (propertyCount > limits.maxProperties) throw new Error(label + 'の項目数が上限を超えています。');
      keys.forEach(function(key) {
        if (key.length > SECURITY_MAX_PROPERTY_NAME_CHARS || key === '__proto__' || key === 'prototype' || key === 'constructor') {
          throw new Error(label + 'に使用できない項目名があります。');
        }
        visit(item[key], depth + 1);
      });
    }
    seen.pop();
  }
  visit(value, 0);
  let serialized;
  try { serialized = JSON.stringify(value); }
  catch (error) { throw new Error(label + 'を読み取れません。'); }
  if (utf8Length_(serialized || '') > limits.maxBytes) throw new Error(label + 'のデータ容量が上限を超えています。');
}

function assertTextLimit_(value, label, maxLength, required) {
  if (typeof value !== 'string') throw new Error(label + 'の形式を確認してください。');
  if (required && !value.trim()) throw new Error(label + 'は必須です。');
  if (Array.from(value).length > maxLength) throw new Error(label + 'は' + maxLength + '文字以内で入力してください。');
}

function validateDraftId_(draftId) {
  required_(draftId, '運航下書きID');
  const text = String(draftId);
  const uuidFormat = /^op_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidFormat.test(text)) {
    throw new Error('運航下書きIDの形式を確認してください。');
  }
}

function normalizedCommitInput_(input) {
  const session = input && input.session;
  const postflight = input && input.postflight;
  if (!session || typeof session !== 'object' || Array.isArray(session) ||
      !postflight || typeof postflight !== 'object' || Array.isArray(postflight)) {
    throw new Error('確定する運航データがありません。');
  }
  if (!session.aircrafts || typeof session.aircrafts !== 'object' || Array.isArray(session.aircrafts) ||
      !postflight.aircrafts || typeof postflight.aircrafts !== 'object' || Array.isArray(postflight.aircrafts) ||
      !Array.isArray(session.flights)) {
    throw new Error('運航データの形式を確認してください。');
  }
  validateDraftId_(session.draftId);
  const aircrafts = {};
  Object.keys(session.aircrafts || {}).sort().forEach(function(model) {
    const aircraft = session.aircrafts[model] || {};
    if (typeof aircraft !== 'object' || Array.isArray(aircraft)) throw new Error('機体情報の形式を確認してください。');
    aircrafts[model] = {
      model: model,
      used: aircraft.used == null ? false : aircraft.used,
      preflightChecks: aircraft.preflightChecks || {},
      preflightAbnormalDetail: aircraft.preflightAbnormalDetail || ''
    };
  });
  const postAircrafts = {};
  Object.keys(postflight.aircrafts || {}).sort().forEach(function(model) {
    const aircraft = postflight.aircrafts[model] || {};
    if (typeof aircraft !== 'object' || Array.isArray(aircraft)) throw new Error('飛行後点検の形式を確認してください。');
    postAircrafts[model] = {
      checks: aircraft.checks || {},
      abnormal: aircraft.abnormal == null ? false : aircraft.abnormal,
      defectLocation: aircraft.defectLocation || '',
      defectDetail: aircraft.defectDetail || '',
      actionDetail: aircraft.actionDetail || ''
    };
  });
  return canonicalValue_({
    session: {
      draftId: String(session.draftId),
      operationDate: session.operationDate || '',
      forceNewLocation: session.forceNewLocation == null ? false : session.forceNewLocation,
      model: session.model || '',
      purpose: session.purpose || '',
      route: session.route || '',
      method: session.method || '',
      category: session.category || '',
      permitNo: session.permitNo || '',
      inspectionLocation: session.inspectionLocation || '',
      pilot: session.pilot || '',
      assistant: session.assistant || '',
      cert: session.cert || '',
      preflightAbnormalDetail: session.preflightAbnormalDetail || '',
      aircrafts: aircrafts,
      flights: (session.flights || []).map(function(flight, index) {
        if (!flight || typeof flight !== 'object' || Array.isArray(flight)) throw new Error('飛行記録の形式を確認してください。');
        return {
          model: flight.model || '', index: flight.index == null ? index + 1 : flight.index,
          battery: flight.battery, cycle: flight.cycle || '',
          takeoffLocation: flight.takeoffLocation || '', landingLocation: flight.landingLocation || '',
          takeoffAt: flight.takeoffAt || '', landingAt: flight.landingAt || '',
          actualMinutes: flight.actualMinutes, safetyIssue: flight.safetyIssue == null ? false : flight.safetyIssue,
          safetyDetail: flight.safetyDetail || '', batteryNote: flight.batteryNote || ''
        };
      })
    },
    postflight: {
      inspectionLocation: postflight.inspectionLocation || '',
      confirmer: postflight.confirmer || '',
      checks: postflight.checks || {},
      aircrafts: postAircrafts
    }
  });
}

function validateCheckMap_(checks, allowedNames, label) {
  if (!checks || typeof checks !== 'object' || Array.isArray(checks)) throw new Error(label + 'の形式を確認してください。');
  Object.keys(checks).forEach(function(name) {
    if (allowedNames.indexOf(name) < 0 || ['正常','異常'].indexOf(checks[name]) < 0) {
      throw new Error(label + 'の値を確認してください。');
    }
  });
}

