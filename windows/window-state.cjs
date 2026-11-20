'use strict';
const fs=require('node:fs');
const path=require('node:path');
const bounded=(value,min,max)=>Math.min(max,Math.max(min,value));
function fitWindow({area={x:0,y:0,width:1920,height:1080},saved,displays=[area]}={}){
  const valid=record=>record&&['x','y','width','height'].every(key=>Number.isFinite(record[key]))&&record.width>=320&&record.height>=240&&displays.some(d=>record.x+record.width>d.x+80&&record.y+record.height>d.y+80&&record.x<d.x+d.width-80&&record.y<d.y+d.height-80);
  const overlap=(record,d)=>Math.max(0,Math.min(record.x+record.width,d.x+d.width)-Math.max(record.x,d.x))*Math.max(0,Math.min(record.y+record.height,d.y+d.height)-Math.max(record.y,d.y));
  const target=valid(saved)?[...displays].sort((a,b)=>overlap(saved,b)-overlap(saved,a))[0]||area:area;
  const width=Math.max(320,Number(target.width)||1920),height=Math.max(240,Number(target.height)||1080);
  const availableWidth=Math.max(320,width-24),availableHeight=Math.max(240,height-24);
  const minimumWidth=Math.min(900,availableWidth),minimumHeight=Math.min(600,availableHeight);
  const bounds=valid(saved)?{x:Math.round(saved.x),y:Math.round(saved.y),width:Math.round(bounded(saved.width,minimumWidth,availableWidth)),height:Math.round(bounded(saved.height,minimumHeight,availableHeight))}:{width:Math.round(bounded(width*.88,minimumWidth,Math.min(1920,availableWidth))),height:Math.round(bounded(height*.86,minimumHeight,Math.min(1200,availableHeight)))};
  if(!valid(saved)){bounds.x=Math.round(target.x+(width-bounds.width)/2);bounds.y=Math.round(target.y+(height-bounds.height)/2);}
  else{
    const display=displays.find(d=>bounds.x+bounds.width>d.x+80&&bounds.y+bounds.height>d.y+80&&bounds.x<d.x+d.width-80&&bounds.y<d.y+d.height-80)||area;
    bounds.x=Math.round(bounded(bounds.x,display.x,display.x+Math.max(0,display.width-bounds.width)));
    bounds.y=Math.round(bounded(bounds.y,display.y,display.y+Math.max(0,display.height-bounds.height)));
  }
  return {...bounds,minWidth:minimumWidth,minHeight:minimumHeight};
}
function readWindowState(directory){try{return JSON.parse(fs.readFileSync(path.join(directory,'window-state.json'),'utf8'));}catch{return null;}}
function writeWindowState(directory,bounds){if(!bounds||!['x','y','width','height'].every(key=>Number.isFinite(bounds[key])))return;fs.writeFileSync(path.join(directory,'window-state.json'),JSON.stringify({x:Math.round(bounds.x),y:Math.round(bounds.y),width:Math.round(bounds.width),height:Math.round(bounds.height)})+'\n',{mode:0o600});}
module.exports={fitWindow,readWindowState,writeWindowState};
