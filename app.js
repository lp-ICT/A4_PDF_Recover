/* global PDFLib, SplitterCore */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const input=$('pdfInput'),drop=$('dropZone'),convertBtn=$('convertBtn');
  let sourceBytes=null,sourceName='',previewUrl=null,downloadUrl=null;

  document.querySelectorAll('input[name="mode"]').forEach(r=>r.addEventListener('change',()=>{
    document.querySelectorAll('.mode-card').forEach(c=>c.classList.toggle('selected',c.querySelector('input').checked));
    $('bookletDiagram').classList.toggle('hidden',selectedMode()!=='booklet');
  }));
  input.addEventListener('change',()=>loadFile(input.files[0]));
  ['dragenter','dragover'].forEach(type=>drop.addEventListener(type,e=>{e.preventDefault();drop.classList.add('drag')}));
  ['dragleave','drop'].forEach(type=>drop.addEventListener(type,e=>{e.preventDefault();drop.classList.remove('drag')}));
  drop.addEventListener('drop',e=>loadFile(e.dataTransfer.files[0]));
  convertBtn.addEventListener('click',convert);
  $('resetBtn').addEventListener('click',reset);

  function selectedMode(){return document.querySelector('input[name="mode"]:checked').value}
  function showMessage(text){$('message').textContent=text||''}
  function setProgress(p,text){$('progressWrap').classList.remove('hidden');$('progressBar').style.width=`${p}%`;$('progressText').textContent=text}
  function cleanUrl(url){if(url)URL.revokeObjectURL(url)}
  function safeNumber(id){const n=Number($(id).value);return Number.isFinite(n)?n:0}

  async function loadFile(file){
    showMessage('');
    if(!file)return;
    if(file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf')){showMessage('請選擇 PDF 檔案。');return}
    try{
      sourceBytes=new Uint8Array(await file.arrayBuffer());sourceName=file.name;
      const doc=await PDFLib.PDFDocument.load(sourceBytes,{ignoreEncryption:false});
      const rotations=doc.getPages().map(p=>SplitterCore.normalizeRotation(p.getRotation().angle));
      const rotatedCount=rotations.filter(angle=>angle!==0).length;
      const rotationNote=rotatedCount?` · 偵測到 ${rotatedCount} 頁旋轉標記，轉換時會自動修正`:'';
      $('fileLabel').textContent=file.name;
      $('fileMeta').textContent=`✓ 已載入 ${doc.getPageCount()} 個掃描頁 · ${(file.size/1024/1024).toFixed(1)} MB · 預計輸出 ${doc.getPageCount()*2} 張 A4${rotationNote}`;
      $('fileMeta').classList.remove('hidden');convertBtn.disabled=false;
    }catch(err){sourceBytes=null;convertBtn.disabled=true;showMessage(err.message.includes('encrypted')?'此 PDF 已加密，請先解除密碼保護。':'無法讀取這個 PDF，請確認檔案沒有損壞。')}
  }

  async function convert(){
    if(!sourceBytes)return;
    convertBtn.disabled=true;showMessage('');$('resultPanel').classList.add('hidden');
    setProgress(3,'讀取 PDF……');
    try{
      await nextFrame();
      const originalSrc=await PDFLib.PDFDocument.load(sourceBytes);
      const src=await normalizeRotatedPages(originalSrc);
      const mode=selectedMode(),swap=$('swapSides').checked,rotateBack=$('rotateBack').checked;
      const plan=SplitterCore.buildPlan(src.getPageCount(),mode,swap);
      const out=await PDFLib.PDFDocument.create();
      const a4w=595.2756,a4h=841.8898;
      const opts={gutterMm:safeNumber('gutterMm'),splitOffsetMm:safeNumber('splitOffsetMm'),outerMarginMm:safeNumber('outerMarginMm')};
      for(let i=0;i<plan.length;i++){
        const item=plan[i],page=src.getPage(item.scan),size=page.getSize();
        const box=SplitterCore.cropBox(size.width,size.height,item.side,opts);
        const embedded=await out.embedPage(page,box);
        const cropW=box.right-box.left,cropH=box.top-box.bottom;
        const scale=Math.min(a4w/cropW,a4h/cropH),w=cropW*scale,h=cropH*scale;
        const target=out.addPage([a4w,a4h]);
        const shouldRotate=rotateBack&&item.scan%2===1;
        if(shouldRotate){
          target.drawPage(embedded,{x:(a4w+w)/2,y:(a4h+h)/2,width:w,height:h,rotate:PDFLib.degrees(180)});
        }else{
          target.drawPage(embedded,{x:(a4w-w)/2,y:(a4h-h)/2,width:w,height:h});
        }
        if(i%2===0){setProgress(8+Math.round((i+1)/plan.length*80),`處理第 ${i+1} / ${plan.length} 頁……`);await nextFrame()}
      }
      out.setTitle(sourceName.replace(/\.pdf$/i,'')+'（A4）');
      out.setCreator('A4 PDF 小冊子還原工具');out.setProducer('pdf-lib');
      setProgress(92,'建立下載檔案……');
      const bytes=await out.save({useObjectStreams:true});
      const blob=new Blob([bytes],{type:'application/pdf'});
      cleanUrl(previewUrl);cleanUrl(downloadUrl);previewUrl=URL.createObjectURL(blob);downloadUrl=URL.createObjectURL(blob);
      const base=sourceName.replace(/\.pdf$/i,'');
      $('downloadBtn').href=downloadUrl;$('downloadBtn').download=`${base}_A4還原版.pdf`;
      $('previewFrame').src=previewUrl+'#page=1&zoom=page-fit';
      const fixedCount=originalSrc.getPages().filter(p=>SplitterCore.normalizeRotation(p.getRotation().angle)!==0).length;
      const fixedNote=fixedCount?` · 已自動修正 ${fixedCount} 頁方向`:'';
      $('resultMeta').textContent=`${src.getPageCount()} 個掃描頁 → ${plan.length} 張標準 A4 · ${(blob.size/1024/1024).toFixed(1)} MB${fixedNote}`;
      $('resultPanel').classList.remove('hidden');setProgress(100,'完成');
      $('resultPanel').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(err){showMessage(err.message||'轉換失敗，請嘗試另一個 PDF。');$('progressWrap').classList.add('hidden')}
    finally{convertBtn.disabled=!sourceBytes}
  }

  function reset(){
    sourceBytes=null;sourceName='';input.value='';convertBtn.disabled=true;showMessage('');
    $('fileLabel').textContent='尚未選擇檔案';$('fileMeta').classList.add('hidden');$('resultPanel').classList.add('hidden');$('progressWrap').classList.add('hidden');
    cleanUrl(previewUrl);cleanUrl(downloadUrl);previewUrl=downloadUrl=null;
  }

  async function normalizeRotatedPages(src){
    const pages=src.getPages();
    const needsFix=pages.some(page=>SplitterCore.normalizeRotation(page.getRotation().angle)!==0);
    if(!needsFix)return src;
    setProgress(5,'自動修正頁面方向……');await nextFrame();
    const normalized=await PDFLib.PDFDocument.create();
    for(let i=0;i<pages.length;i++){
      const sourcePage=pages[i],{width,height}=sourcePage.getSize();
      const rotation=sourcePage.getRotation().angle;
      const plan=SplitterCore.rotationPlan(width,height,rotation);
      const embedded=await normalized.embedPage(sourcePage,{left:0,bottom:0,right:width,top:height});
      const target=normalized.addPage([plan.width,plan.height]);
      target.drawPage(embedded,{x:plan.x,y:plan.y,width,height,rotate:PDFLib.degrees(plan.rotation)});
      if(i%2===0){setProgress(5+Math.round((i+1)/pages.length*10),`修正第 ${i+1} / ${pages.length} 頁方向……`);await nextFrame()}
    }
    const bytes=await normalized.save({useObjectStreams:true});
    return PDFLib.PDFDocument.load(bytes);
  }
  function nextFrame(){return new Promise(resolve=>requestAnimationFrame(()=>resolve()))}
})();
