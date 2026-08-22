export const CRYPTO_CREDIT_CALCULATION_VERSION = "crypto-credit-derived-v1";

export interface CalculationPoint { id:string; observedAt:Date; value:number }
export interface DerivedMetric { code:string; calculatedAt:Date; value:number; inputObservationIds:readonly string[] }

function atOrBefore(points:readonly CalculationPoint[], target:number):CalculationPoint|undefined {
  for(let index=points.length-1;index>=0;index-=1) if(points[index]!.observedAt.getTime()<=target)return points[index];
  return undefined;
}
function percent(current:number,previous:number){return previous===0?null:(current-previous)/previous*100;}

export function deriveStablecoinMetrics(points:readonly CalculationPoint[]):DerivedMetric[] {
  const ordered=[...points].sort((a,b)=>a.observedAt.getTime()-b.observedAt.getTime());
  return ordered.flatMap(current=>{
    const t=current.observedAt.getTime(); const p30=atOrBefore(ordered,t-30*86_400_000); const p60=atOrBefore(ordered,t-60*86_400_000); const p90=atOrBefore(ordered,t-90*86_400_000);
    if(!p30||!p60||!p90)return [];
    const growth30=percent(current.value,p30.value);const previous30=percent(p30.value,p60.value);const growth90=percent(current.value,p90.value);
    if(growth30===null||previous30===null||growth90===null)return [];
    return [
      {code:"STABLECOIN_GROWTH_30D_PERCENT",calculatedAt:current.observedAt,value:growth30,inputObservationIds:[current.id,p30.id]},
      {code:"STABLECOIN_GROWTH_90D_PERCENT",calculatedAt:current.observedAt,value:growth90,inputObservationIds:[current.id,p90.id]},
      {code:"STABLECOIN_GROWTH_ACCELERATION_PP",calculatedAt:current.observedAt,value:growth30-previous30,inputObservationIds:[current.id,p30.id,p60.id]}
    ];
  });
}

export function deriveRollingSum(points:readonly CalculationPoint[], code:string,window=20):DerivedMetric[] {
  const ordered=[...points].sort((a,b)=>a.observedAt.getTime()-b.observedAt.getTime());
  return ordered.flatMap((current,index)=>index+1<window?[]:[{code,calculatedAt:current.observedAt,value:ordered.slice(index-window+1,index+1).reduce((sum,item)=>sum+item.value,0),inputObservationIds:ordered.slice(index-window+1,index+1).map(item=>item.id)}]);
}

export function deriveGrowth(points:readonly CalculationPoint[],code:string,days:number):DerivedMetric[] {
  const ordered=[...points].sort((a,b)=>a.observedAt.getTime()-b.observedAt.getTime());
  return ordered.flatMap(current=>{const previous=atOrBefore(ordered,current.observedAt.getTime()-days*86_400_000);const value=previous?percent(current.value,previous.value):null;return previous&&value!==null?[{code,calculatedAt:current.observedAt,value,inputObservationIds:[current.id,previous.id]}]:[];});
}
