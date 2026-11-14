(function(){
  // Existing Home Screen installations keep the same origin and application.
  if(location.pathname!=='/'&&location.pathname!=='/index.html')return;
  var installed=navigator.standalone===true||(window.matchMedia&&matchMedia('(display-mode: standalone)').matches);
  if(installed)location.replace('/app?source=installed');
})();
