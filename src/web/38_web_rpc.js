// google.script.runの通信だけを担当。STATE・DOM・下書きは変更しない。

function runServerRequest(name, arg, onSuccess, onFailure){
  var request = google.script.run
    .withSuccessHandler(onSuccess)
    .withFailureHandler(onFailure);
  if(arg === undefined) request[name]();
  else request[name](arg);
}
