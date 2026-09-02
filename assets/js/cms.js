(function(){
  function run(){
    if(!window.__IVC_PARTS) return;
    for(var i=0;i<3;i++){ if(typeof window.__IVC_PARTS[i] !== 'string') return; }
    var s = window.__IVC_PARTS[0]+window.__IVC_PARTS[1]+window.__IVC_PARTS[2];
    var el = document.createElement('script');
    el.text = s;
    document.documentElement.appendChild(el);
  }
  run();
})();
