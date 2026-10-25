"""Item 2 cross-check: Open-Meteo marine SST at each coastal spot vs NOAA
satellite products (run once on 2026-10-25/26 NZDT; output committed as
docs/sst/sst_check_2026-10-23.json, written up in docs/SST_CHECK.md).

* NOAA Coral Reef Watch CoralTemp v3.1, 5 km daily (``noaacrwsstDaily``) and
  its anomaly (``noaacrwsstanomalyDaily``) on coastwatch.noaa.gov ERDDAP,
  for 2026-10-23, mean of 5 km pixels within +/-0.06 deg of the OM cell.
* NOAA OISST v2.1 0.25 deg (``oisst_rclone``) on upwell.pfeg.noaa.gov ERDDAP
  for 2026-10-08 (latest final day available when run), +/-0.13 deg.
* Open-Meteo marine ``sea_surface_temperature``, daily mean of hourly values
  (UTC day) at the same dates.

Needs network:  python tools/sst_check.py [OUT.json] [CRW_DATE ...]

v2.2 (2026-10-26 NZDT): rerun at the new marine points (docs/MARINE_POINTS.md)
for CRW 22 and 23 Oct -> docs/sst/sst_check_v2.2_2026-10-23.json
(``python tools/sst_check.py docs/sst/sst_check_v2.2_2026-10-23.json 2026-10-22 2026-10-23``).
"""
import requests, statistics as st, sys, json
sys.path.insert(0,'.')
from fishon_engine import spots
S=[s for s in spots.list_spots() if s.is_coastal]
OUT=sys.argv[1] if len(sys.argv)>1 else "docs/sst/sst_check_2026-10-23.json"
EXTRA=sys.argv[3:] if len(sys.argv)>3 else []   # extra CRW days besides 23 Oct (argv[2] is 23 Oct)
om=requests.get("https://marine-api.open-meteo.com/v1/marine",params={"latitude":",".join(str(s.marine_lat) for s in S),"longitude":",".join(str(s.marine_lon) for s in S),
 "hourly":"sea_surface_temperature","timezone":"UTC","start_date":"2026-10-23","end_date":"2026-10-23"},timeout=60).json()
def crw(var,ds,la,lo,h=0.06,t="2026-10-23T12:00:00Z"):
    u=f"https://coastwatch.noaa.gov/erddap/griddap/{ds}.csv?{var}%5B({t})%5D%5B({la+h}):({la-h})%5D%5B({lo-h}):({lo+h})%5D"
    r=requests.get(u,timeout=90); lines=r.text.strip().split("\n")[2:]
    v=[float(l.split(",")[3]) for l in lines if l.split(",")[3] not in ("NaN","")]
    return (round(st.mean(v),2), len(v)) if v else (None,0)
def oi(la,lo,h=0.13):
    lo360=lo%360
    u=f"https://upwell.pfeg.noaa.gov/erddap/griddap/oisst_rclone.csv?sst%5B(2026-10-08T12:00:00Z)%5D%5B(0.0)%5D%5B({la-h}):({la+h})%5D%5B({lo360-h}):({lo360+h})%5D"
    r=requests.get(u,timeout=90); lines=r.text.strip().split("\n")[2:]
    v=[float(l.split(",")[4]) for l in lines if len(l.split(","))>4 and l.split(",")[4] not in ("NaN","")]
    return (round(st.mean(v),2),len(v)) if v else (None,0)
om8=requests.get("https://marine-api.open-meteo.com/v1/marine",params={"latitude":",".join(str(s.marine_lat) for s in S),"longitude":",".join(str(s.marine_lon) for s in S),
 "hourly":"sea_surface_temperature","timezone":"UTC","start_date":"2026-10-08","end_date":"2026-10-08"},timeout=60).json()
rows=[]
for s,d,d8 in zip(S,om,om8):
    cl,cn=d['latitude'],d['longitude']
    v=[x for x in d['hourly']['sea_surface_temperature'] if x is not None]
    v8=[x for x in d8['hourly']['sea_surface_temperature'] if x is not None]
    a=crw('analysed_sst','noaacrwsstDaily',cl,cn); an=crw('sea_surface_temperature_anomaly','noaacrwsstanomalyDaily',cl,cn)
    o=oi(cl,cn)
    row=dict(id=s.id,request=[s.marine_lat,s.marine_lon],cell=[cl,cn],om_23=round(st.mean(v),2) if v else None,crw_23=a[0],crw_n=a[1],crw_anom_23=an[0],om_08=round(st.mean(v8),2) if v8 else None,oisst_08=o[0],oisst_n=o[1])
    for dd in [x for x in EXTRA if x!="2026-10-23"]:
        dx=requests.get("https://marine-api.open-meteo.com/v1/marine",params={"latitude":s.marine_lat,"longitude":s.marine_lon,
            "hourly":"sea_surface_temperature","timezone":"UTC","start_date":dd,"end_date":dd},timeout=60).json()
        vx=[x for x in dx['hourly']['sea_surface_temperature'] if x is not None]
        ax=crw('analysed_sst','noaacrwsstDaily',cl,cn,t=f"{dd}T12:00:00Z")
        row[f"om_{dd}"]=round(st.mean(vx),2) if vx else None; row[f"crw_{dd}"]=ax[0]; row[f"crw_n_{dd}"]=ax[1]
    rows.append(row); print(row, flush=True)
json.dump(rows, open(OUT, "w"), indent=1)
