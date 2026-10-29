// Worklet-to-JS queue has a hard bound. If JS cannot keep up, fail the whole
// capture rather than silently dropping samples and finalizing a truncated turn.
export const voiceLabWorkletSource = `class SenseiPcm extends AudioWorkletProcessor {
 constructor() {
  super();this.outstanding=0;this.frames=0;this.failed=false;
  this.port.onmessage=(event)=>{if(event.data==='ack')this.outstanding=Math.max(0,this.outstanding-1);};
 }
 process(inputs,outputs) {
  if(this.failed)return false;
  const channels=inputs[0];
  if(channels&&channels.length&&channels[0].length) {
   if(this.outstanding>=128){this.failed=true;this.port.postMessage({overflow:true});return false;}
   const length=channels[0].length;const data=new ArrayBuffer(length*2);const view=new DataView(data);
   for(let i=0;i<length;i++) {let mono=0;for(const channel of channels)mono+=(channel[i]||0)/channels.length;
    const value=Math.max(-1,Math.min(1,mono));view.setInt16(i*2,Math.round(value<0?value*32768:value*32767),true);}
   this.frames+=length;this.outstanding++;
   this.port.postMessage({data,timestamp:this.frames/sampleRate},[data]);
  }
  for(const bus of outputs)for(const channel of bus)channel.fill(0);
  return true;
 }
}registerProcessor('sensei-pcm',SenseiPcm);`;
