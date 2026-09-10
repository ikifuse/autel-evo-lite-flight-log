// 共通DOM・フォーム表示と画面port。具体的なcontroller/画面実装へ依存しない。

var SCREEN_PORTS = null;

function configureScreenPorts(ports){ SCREEN_PORTS = ports; }

function screenState(){ return SCREEN_PORTS.state(); }

function screenAction(name, arg, onSuccess){ return SCREEN_PORTS.action(name, arg, onSuccess); }

function screenRender(state){ return SCREEN_PORTS.render(state); }

function screenGps(targetId, targetRouteId){ return SCREEN_PORTS.gps(targetId, targetRouteId); }

function screenDiagnosis(){ return SCREEN_PORTS.diagnosis(); }

function screenReset(){ return SCREEN_PORTS.reset(); }

function screenCancel(){ return SCREEN_PORTS.cancel(); }

function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}

function el(id){return document.getElementById(id)}

function val(id){var x=el(id);return x?String(x.value).trim():''}

function isChecked(id){var x=el(id);return !!(x&&x.checked)}

function busy(b){el('loading').style.display=b?'flex':'none'}

function updateNetworkStatus(){
  var online = navigator.onLine;
  var badge = el('networkBadge');
  if(!badge) return;
  badge.className = 'network-badge ' + (online ? 'online' : 'offline');
  badge.innerText = online ? '● オンライン' : '● 圏外（入力は端末に保持）';
}

function formatTimeStr(iso){
  if(!iso) return '';
  var d = new Date(iso);
  var h = ('0' + d.getHours()).slice(-2);
  var m = ('0' + d.getMinutes()).slice(-2);
  return h + ':' + m;
}

function clearFormErrors(containerId){
  var banner = el(containerId + '_errorBanner');
  if(banner) banner.remove();
  var errInputs = document.querySelectorAll('.input-error');
  for(var i=0; i<errInputs.length; i++){
    errInputs[i].classList.remove('input-error');
  }
}

function showFormErrors(containerId, errorItems){
  clearFormErrors(containerId);
  if(!errorItems || errorItems.length === 0) return true;

  var container = el(containerId);
  var banner = document.createElement('div');
  banner.id = containerId + '_errorBanner';
  banner.className = 'error-banner';

  var html = '<strong>⚠️ 未入力または確認が必要な項目があります</strong><ul>';
  for(var i=0; i<errorItems.length; i++){
    var item = errorItems[i];
    html += '<li>【' + esc(item.label) + '】 ' + esc(item.message || '入力してください。') + '</li>';
    if(item.id){
      var elem = el(item.id);
      if(elem){
        elem.classList.add('input-error');
        (function(targetElem){
          var removeErr = function(){
            targetElem.classList.remove('input-error');
            targetElem.removeEventListener('input', removeErr);
            targetElem.removeEventListener('change', removeErr);
          };
          targetElem.addEventListener('input', removeErr);
          targetElem.addEventListener('change', removeErr);
        })(elem);
      }
    }
  }
  html += '</ul>';
  banner.innerHTML = html;

  if(container){
    container.insertBefore(banner, container.firstChild);
  }

  var firstElem = errorItems[0].id ? el(errorItems[0].id) : null;
  if(firstElem){
    firstElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    try{ firstElem.focus(); }catch(e){}
  } else if(banner) {
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return false;
}

function sessionHeaderHtml(){
  var s = screenState().session;
  var recordLabel = s.blockNo
    ? s.dateSheet + ' No.' + s.blockNo
    : s.operationDate + '（全運航終了時に一括保存）';
  return '<div class="card status-box" style="margin-bottom:8px;">' +
    '<div class="flex-between">' +
      '<div><strong>' + esc(recordLabel) + '</strong> ｜ ' + esc(s.model) + '</div>' +
      '<div class="flex-row" style="gap:6px;align-items:center;">' +
        '<span class="badge active">' + esc(s.category) + '</span>' +
        '<button type="button" class="btn btn-secondary btn-sm" style="padding:2px 8px;font-size:11px;" onclick="screenCancel()">↩ 運航中止</button>' +
      '</div>' +
    '</div>' +
    '<div class="text-sm" style="margin-top:4px;">' + esc(s.route) + ' / ' + esc(s.purpose) + '</div>' +
  '</div>';
}
