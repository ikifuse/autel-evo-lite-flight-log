// GPS取得と国土地理院の逆ジオコーディング。

function fetchCurrentGps(targetId, targetRouteId){
  if(!navigator.geolocation){
    alert('お使いのブラウザはGPS位置情報に対応していません。');
    return;
  }
  busy(true);
  navigator.geolocation.getCurrentPosition(function(pos){
    var lat = pos.coords.latitude.toFixed(6);
    var lng = pos.coords.longitude.toFixed(6);
    var latLabel = (pos.coords.latitude >= 0 ? '北緯' : '南緯') + Math.abs(pos.coords.latitude).toFixed(4);
    var lngLabel = (pos.coords.longitude >= 0 ? '東経' : '西経') + Math.abs(pos.coords.longitude).toFixed(4);
    var coordStr = '（' + latLabel + ', ' + lngLabel + '）';

    var gsiUrl = 'https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=' + lat + '&lon=' + lng;
    fetch(gsiUrl)
      .then(function(res){ return res.json(); })
      .then(function(data){
        busy(false);
        var addr = '';
        if(data && data.results && data.results.lv01Nm){
          addr = data.results.lv01Nm;
        }
        var fullLocation = (addr ? addr + ' ' : '') + coordStr;
        if(el(targetId)) el(targetId).value = fullLocation;
        if(targetRouteId && el(targetRouteId) && !el(targetRouteId).value){
          el(targetRouteId).value = (addr || '離陸地点') + '周辺 半径100m以内';
        }
      })
      .catch(function(){
        busy(false);
        var fullLocation = '現地 ' + coordStr;
        if(el(targetId)) el(targetId).value = fullLocation;
        if(targetRouteId && el(targetRouteId) && !el(targetRouteId).value){
          el(targetRouteId).value = '離陸地点周辺 半径100m以内';
        }
      });
  }, function(err){
    busy(false);
    alert('GPS位置情報を取得できませんでした：' + err.message);
  }, { enableHighAccuracy: true, timeout: 8000 });
}
