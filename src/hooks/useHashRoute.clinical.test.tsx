import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useHashRoute } from './useHashRoute';
afterEach(cleanup);
it.each(['consultation','discharge'])('recognizes %s as a working visit section rather than a chart ID',section=>{
 window.history.replaceState(null,'','/#/chart/'+section);
 const {result}=renderHook(useHashRoute);
 expect(result.current.route).toEqual({view:'chart',section});
});
it.each(['consultation','discharge'])('keeps the saved chart ID when deep-linking to %s',section=>{
 window.history.replaceState(null,'','/#/chart/visit-123/'+section);
 const {result}=renderHook(useHashRoute);
 expect(result.current.route).toEqual({view:'chart',chartId:'visit-123',section});
});
it.each(['/#/chart/owner-report','/#/chart/visit-123/owner-report'])('keeps legacy owner-report links pointed at discharge: %s',path=>{
 window.history.replaceState(null,'',path);
 const {result}=renderHook(useHashRoute);
 expect(result.current.route.section).toBe('discharge');
 expect(result.current.route.chartId).toBe(path.includes('visit-123')?'visit-123':undefined);
});
