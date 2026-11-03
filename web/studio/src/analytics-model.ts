import type {MetricFilters,MetricTrend} from './types.js';
export function defaultMetricFilters(now=new Date()):MetricFilters {const to=now.toISOString().slice(0,10),from=new Date(to+'T00:00:00.000Z');from.setUTCDate(from.getUTCDate()-6);return {from:from.toISOString().slice(0,10),to,article:'',language:'',destination:'ghost'};}
export function metricValue(metric:{value:number|null;availability:string},locale:string):string {return metric.availability==='Available'&&typeof metric.value==='number'&&Number.isFinite(metric.value)&&metric.value>=0?new Intl.NumberFormat(locale==='zh'?'zh-CN':'en-GB').format(metric.value):'Unavailable';}
export function metricQuery(ownerId:string,filters:MetricFilters):URLSearchParams {
 for(const date of [filters.from,filters.to])if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))throw new Error('Dates must be valid UTC YYYY-MM-DD values');
 if(filters.from&&filters.to&&filters.from>filters.to)throw new Error('Date range is reversed');
 const query=new URLSearchParams({ownerId});for(const key of ['from','to','article','language','destination'] as const)if(filters[key])query.set(key,filters[key]);return query;
}
export function trendPoints(rows:MetricTrend[],field:'pageViews'|'estimatedDailyVisitors'):string {
 if(!rows.length)return '';const times=rows.map(row=>Date.parse(row.date+'T00:00:00.000Z')),first=Math.min(...times),span=Math.max(1,Math.max(...times)-first),max=Math.max(1,...rows.map(row=>Math.max(row.pageViews,row.estimatedDailyVisitors)));
 return rows.map((row,index)=>`${(30+(times[index]-first)/span*640).toFixed(2)},${(180-row[field]/max*150).toFixed(2)}`).join(' ');
}
