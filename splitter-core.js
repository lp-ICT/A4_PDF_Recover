(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SplitterCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function buildPlan(scanPageCount,mode,swapSides){
    if(!Number.isInteger(scanPageCount)||scanPageCount<1)throw new Error('PDF 沒有可處理的頁面。');
    const plan=[];
    const sides=swapSides?['right','left']:['left','right'];
    if(mode==='simple'){
      for(let scan=0;scan<scanPageCount;scan++){
        plan.push({logical:scan*2+1,scan,side:sides[0]});
        plan.push({logical:scan*2+2,scan,side:sides[1]});
      }
      return plan;
    }
    if(scanPageCount%2!==0)throw new Error('小冊子模式需要偶數個掃描頁（每張紙正面及背面各一頁）。');
    const total=scanPageCount*2;
    const sheets=scanPageCount/2;
    for(let sheet=0;sheet<sheets;sheet++){
      const front=sheet*2,back=front+1;
      plan.push({logical:total-sheet*2,scan:front,side:sides[0]});
      plan.push({logical:1+sheet*2,scan:front,side:sides[1]});
      plan.push({logical:2+sheet*2,scan:back,side:sides[0]});
      plan.push({logical:total-1-sheet*2,scan:back,side:sides[1]});
    }
    return plan.sort((a,b)=>a.logical-b.logical);
  }

  function cropBox(width,height,side,opts){
    const ptPerMm=72/25.4;
    const gutter=Math.max(0,opts.gutterMm||0)*ptPerMm;
    const outer=Math.max(0,opts.outerMarginMm||0)*ptPerMm;
    const split=width/2+(opts.splitOffsetMm||0)*ptPerMm;
    const box=side==='left'
      ?{left:outer,bottom:outer,right:split-gutter/2,top:height-outer}
      :{left:split+gutter/2,bottom:outer,right:width-outer,top:height-outer};
    if(box.right-box.left<20||box.top-box.bottom<20)throw new Error('裁切設定過大，頁面沒有足夠內容。');
    return box;
  }
  return {buildPlan,cropBox};
});
