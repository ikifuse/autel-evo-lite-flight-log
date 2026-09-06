function required_(value, label) {
  if (value == null || String(value).trim() === '') throw new Error(label + 'は必須です。');
}

function normalizeList_(value) {
  if (Array.isArray(value)) return value.map(String).map(item => item.trim()).filter(Boolean);
  return value == null || String(value).trim() === '' ? [] : [String(value).trim()];
}

function validateOperationSelection_(input) {
  if (FLIGHT_PURPOSES.indexOf(input.purpose) < 0) throw new Error('飛行目的を選択してください。');
  if (input.purpose === 'その他') required_(input.purposeOther, 'その他の飛行目的');

  const methods = normalizeList_(input.method);
  if (!methods.length) throw new Error('飛行禁止空域・飛行方法を1つ以上選択してください。');
  const allowedMethods = ['通常飛行（特定飛行なし）','屋内練習'].concat(SPECIAL_FLIGHT_METHODS);
  methods.forEach(method => {
    if (allowedMethods.indexOf(method) < 0) throw new Error('飛行禁止空域・飛行方法の選択を確認してください。');
  });

  const category = String(input.category || '');
  if (['カテゴリーⅠ','カテゴリーⅡ','カテゴリーⅢ'].indexOf(category) < 0) {
    throw new Error('飛行カテゴリーを選択してください。');
  }
  const special = methods.filter(method => SPECIAL_FLIGHT_METHODS.indexOf(method) >= 0);
  if (methods.indexOf('通常飛行（特定飛行なし）') >= 0 && methods.length > 1) {
    throw new Error('「通常飛行（特定飛行なし）」は他の飛行方法と同時に選択できません。');
  }
  if (methods.indexOf('屋内練習') >= 0 && methods.length > 1) {
    throw new Error('「屋内練習」は他の飛行方法と同時に選択できません。');
  }
  if (category === 'カテゴリーⅠ' && special.length) {
    throw new Error('特定飛行を選択した場合はカテゴリーⅡまたはⅢです。');
  }
  if ((category === 'カテゴリーⅡ' || category === 'カテゴリーⅢ') && !special.length) {
    throw new Error(category + 'には特定飛行の選択が必要です。');
  }
  return {
    purpose: input.purpose === 'その他' ? 'その他：' + String(input.purposeOther).trim() : input.purpose,
    methods: methods,
    category: category
  };
}

function utf8Length_(text) { return unescape(encodeURIComponent(String(text))).length; }

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

function validateCommitBusinessInput_(input) {
  const session = input.session;
  const postflight = input.postflight;
  if (typeof session.model !== 'string' || !MODELS[session.model]) throw new Error('機体を確認してください。');
  assertTextLimit_(session.route, '飛行経路・場所', SECURITY_TEXT_LIMITS.location, true);
  assertTextLimit_(session.pilot, '操縦者', SECURITY_TEXT_LIMITS.person, true);
  assertTextLimit_(postflight.inspectionLocation, '飛行後の点検実施場所', SECURITY_TEXT_LIMITS.location, true);
  assertTextLimit_(postflight.confirmer, '飛行後の点検確認者', SECURITY_TEXT_LIMITS.person, true);
  assertTextLimit_(session.purpose, '飛行目的', SECURITY_TEXT_LIMITS.purpose, true);
  assertTextLimit_(session.method, '飛行方法', SECURITY_TEXT_LIMITS.method, true);
  assertTextLimit_(session.category, '飛行カテゴリー', 20, true);
  assertTextLimit_(session.permitNo, '許可承認番号', SECURITY_TEXT_LIMITS.identifier, false);
  assertTextLimit_(session.inspectionLocation, '飛行前の点検実施場所', SECURITY_TEXT_LIMITS.location, false);
  assertTextLimit_(session.assistant, '補助者', SECURITY_TEXT_LIMITS.person, false);
  assertTextLimit_(session.cert, '技能証明書番号', SECURITY_TEXT_LIMITS.identifier, false);
  assertTextLimit_(session.preflightAbnormalDetail, '飛行前点検の異常内容', SECURITY_TEXT_LIMITS.detail, false);
  if (typeof session.forceNewLocation !== 'boolean') throw new Error('同日別現場の指定を確認してください。');
  const operationDate = dateFromSheetName_(session.operationDate || format_(now_(), 'yyyy.M.d'));

  validateStoredOperationSelection_(session);

  if (!Array.isArray(session.flights)) throw new Error('飛行記録の形式を確認してください。');
  if (session.flights.length > SECURITY_MAX_FLIGHTS) throw new Error('1運航の飛行記録は' + SECURITY_MAX_FLIGHTS + '件までです。');

  const aircraftKeys = Object.keys(session.aircrafts || {});
  if (aircraftKeys.some(function(model) { return !MODELS[model]; })) throw new Error('機体情報を確認してください。');
  aircraftKeys.forEach(function(model) {
    const ac = session.aircrafts[model];
    if (!ac || typeof ac.used !== 'boolean') throw new Error(model + 'の使用状態を確認してください。');
    validateCheckMap_(ac.preflightChecks || {}, PRE_CHECK_NAMES, model + 'の飛行前点検');
    assertTextLimit_(ac.preflightAbnormalDetail || '', model + 'の飛行前点検異常内容', SECURITY_TEXT_LIMITS.detail, false);
  });
  const usedModels = Object.keys(session.aircrafts || {}).filter(function(model) {
    return session.aircrafts[model] && session.aircrafts[model].used;
  });
  const models = usedModels.length ? usedModels : [session.model];
  if (!models.length || models.length > 2 || models.some(function(model) { return !MODELS[model]; })) {
    throw new Error('記録する機体を確認してください。');
  }
  if (models.indexOf(session.model) < 0) throw new Error('現在の機体情報を確認してください。');
  const postAircraftKeys = Object.keys(postflight.aircrafts || {});
  if (postAircraftKeys.some(function(model) { return !MODELS[model]; })) throw new Error('飛行後点検の機体情報を確認してください。');
  postAircraftKeys.forEach(function(model) {
    const post = postflight.aircrafts[model];
    if (!post || typeof post.abnormal !== 'boolean') throw new Error(model + 'の飛行後点検状態を確認してください。');
    validateCheckMap_(post.checks || {}, POST_CHECK_NAMES, model + 'の飛行後点検');
    assertTextLimit_(post.defectLocation || '', model + 'の不具合箇所', SECURITY_TEXT_LIMITS.location, false);
    assertTextLimit_(post.defectDetail || '', model + 'の不具合内容', SECURITY_TEXT_LIMITS.detail, false);
    assertTextLimit_(post.actionDetail || '', model + 'の処置内容', SECURITY_TEXT_LIMITS.detail, false);
  });
  if (Object.keys(postflight.checks || {}).length) validateCheckMap_(postflight.checks, POST_CHECK_NAMES, '飛行後点検');
  models.forEach(function(model) {
    const ac = session.aircrafts && session.aircrafts[model];
    const missingPre = PRE_CHECK_NAMES.filter(function(name) {
      return !ac || !ac.preflightChecks || !ac.preflightChecks[name];
    });
    if (missingPre.length) throw new Error(model + 'の飛行前点検が未完了です。');
    const post = postflight.aircrafts && postflight.aircrafts[model];
    const missingPost = POST_CHECK_NAMES.filter(function(name) {
      return !post || !post.checks || !post.checks[name];
    });
    if (missingPost.length) throw new Error(model + 'の飛行後点検が未完了です。');
  });
  let totalMinutes = 0;
  session.flights.forEach(function(flight) {
    if (models.indexOf(flight.model) < 0) throw new Error('飛行記録の機体割当を確認してください。');
    if (typeof flight.battery !== 'number' || !Number.isInteger(flight.battery) || flight.battery < 1 || flight.battery > 7) {
      throw new Error('飛行記録のバッテリーを確認してください。');
    }
    if (typeof flight.index !== 'number' || !Number.isInteger(flight.index) || flight.index < 1 || flight.index > SECURITY_MAX_FLIGHTS) {
      throw new Error('飛行記録番号を確認してください。');
    }
    assertTextLimit_(flight.takeoffLocation, '離陸場所', SECURITY_TEXT_LIMITS.location, true);
    assertTextLimit_(flight.landingLocation, '着陸場所', SECURITY_TEXT_LIMITS.location, true);
    assertTextLimit_(flight.takeoffAt, '離陸時刻', 50, true);
    assertTextLimit_(flight.landingAt, '着陸時刻', 50, true);
    if (typeof flight.cycle !== 'string') throw new Error('サイクル数の形式を確認してください。');
    assertTextLimit_(flight.cycle, 'サイクル数', 12, false);
    assertTextLimit_(flight.safetyDetail, '安全に影響した事項', SECURITY_TEXT_LIMITS.detail, false);
    assertTextLimit_(flight.batteryNote, 'バッテリー所感', SECURITY_TEXT_LIMITS.note, false);
    if (typeof flight.safetyIssue !== 'boolean') throw new Error('安全影響の指定を確認してください。');
    const takeoff = new Date(flight.takeoffAt);
    const landing = new Date(flight.landingAt);
    if (isNaN(takeoff.getTime()) || isNaN(landing.getTime()) || landing.getTime() < takeoff.getTime() || landing.getTime() - takeoff.getTime() > 86400000) {
      throw new Error('離着陸時刻を確認してください。');
    }
    if (takeoff.getTime() < operationDate.getTime() - 86400000 || takeoff.getTime() > operationDate.getTime() + 172800000) {
      throw new Error('離着陸時刻と運航日を確認してください。');
    }
    if (typeof flight.actualMinutes !== 'number' || !Number.isInteger(flight.actualMinutes) || flight.actualMinutes <= 0 || flight.actualMinutes > SECURITY_MAX_FLIGHT_MINUTES) {
      throw new Error('実飛行時間を確認してください。');
    }
    totalMinutes += flight.actualMinutes;
  });
  if (totalMinutes > SECURITY_MAX_TOTAL_MINUTES) throw new Error('1運航の合計飛行時間が上限を超えています。');
  return models;
}

function validateCheckMap_(checks, allowedNames, label) {
  if (!checks || typeof checks !== 'object' || Array.isArray(checks)) throw new Error(label + 'の形式を確認してください。');
  Object.keys(checks).forEach(function(name) {
    if (allowedNames.indexOf(name) < 0 || ['正常','異常'].indexOf(checks[name]) < 0) {
      throw new Error(label + 'の値を確認してください。');
    }
  });
}

function validateStoredOperationSelection_(session) {
  let purpose = session.purpose;
  const weatherMatch = purpose.match(/ \[気象: ([^\]]+)\]$/);
  if (weatherMatch) {
    const weatherValues = ['晴','曇','雨','強風注意'];
    const windSpeeds = ['0〜1m/s 静穏','2〜3m/s 穏やか','4〜5m/s 注意','6m/s以上 飛行不可'];
    const directions = ['北','北東','東','南東','南','南西','西','北西'];
    const allowedWeatherParts = weatherValues.slice();
    windSpeeds.forEach(function(speed) {
      allowedWeatherParts.push('風速' + speed);
      directions.forEach(function(direction) { allowedWeatherParts.push('風速' + speed + ' ' + direction); });
    });
    directions.forEach(function(direction) { allowedWeatherParts.push('風向' + direction); });
    weatherMatch[1].split(' / ').forEach(function(part) {
      if (allowedWeatherParts.indexOf(part) < 0) throw new Error('気象情報を確認してください。');
    });
    purpose = purpose.slice(0, weatherMatch.index);
  }
  if (purpose.indexOf('その他：') === 0) {
    if (!purpose.slice('その他：'.length).trim()) throw new Error('その他の飛行目的を確認してください。');
  } else if (FLIGHT_PURPOSES.indexOf(purpose) < 0 || purpose === 'その他') {
    throw new Error('飛行目的を確認してください。');
  }

  let method = session.method;
  const permitMatch = method.match(/ \[許可承認: ([^\]]+)\]$/);
  if (permitMatch) {
    if (!session.permitNo || permitMatch[1] !== session.permitNo) throw new Error('許可承認番号を確認してください。');
    method = method.slice(0, permitMatch.index);
  } else if (session.permitNo) {
    throw new Error('許可承認番号を確認してください。');
  }
  validateOperationSelection_({ purpose: '空撮', method: method.split(' / '), category: session.category });
}

