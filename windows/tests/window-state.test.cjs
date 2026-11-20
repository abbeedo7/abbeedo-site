'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fitWindow}=require('../window-state.cjs');
test('desktop window follows available screen instead of a fixed mobile-sized frame',()=>{
 const desktop=fitWindow({area:{x:0,y:0,width:1920,height:1080}});assert.ok(desktop.width>=1600&&desktop.height>=900);assert.equal(desktop.minWidth,900);assert.equal(desktop.minHeight,600);
 const large=fitWindow({area:{x:0,y:0,width:3840,height:2160}});assert.equal(large.width,1920);assert.equal(large.height,1200);
});
test('window fits small screens and recovers saved positions after a monitor is removed',()=>{
 const area={x:0,y:0,width:800,height:600},small=fitWindow({area});assert.ok(small.width<=800&&small.height<=600&&small.x>=0&&small.y>=0);
 const reset=fitWindow({area,saved:{x:4000,y:100,width:1500,height:900}});assert.ok(reset.x+reset.width<=800&&reset.y+reset.height<=600);
 const primary={x:0,y:0,width:1920,height:1080},secondary={x:-1280,y:0,width:1280,height:720};
 const restored=fitWindow({area:primary,displays:[primary,secondary],saved:{x:-1200,y:10,width:1800,height:1000}});
 assert.ok(restored.x>=-1280&&restored.x+restored.width<=0&&restored.height<=720);
});
