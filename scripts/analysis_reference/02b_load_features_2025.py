import json, pandas as pd, numpy as np
from shapely.geometry import shape
from pyproj import Transformer
SRC='/mnt/user-data/uploads/Downloads/안양시_경진대회_리서치/raw/anyang_bldg_20250904_5186.geojson'
d=json.load(open(SRC,encoding='utf-8'))
tr=Transformer.from_crs(5186,4326,always_xy=True)
rows=[]
for f in d['features']:
    p=f['properties']; g=shape(f['geometry']); c=g.centroid
    lon,lat=tr.transform(c.x,c.y)
    def num(k):
        try: return float(p[k])
        except: return np.nan
    rows.append(dict(A0=p['A0'],pnu=p['A2'],bjd=p['A3'],addr=p['A4'],jibun=p['A5'],san=p['A7'],use=p['A9'],struct=p['A11'],
      barea=num('A12'),approve=p['A13'],gfa=num('A14'),larea=num('A15'),height=num('A16'),bcr=num('A17'),far=num('A18'),
      viol=p['A20'],name=p['A24'],dongname=p['A25'],fl_up=num('A26'),fl_dn=num('A27'),chg=p['A28'],
      x=c.x,y=c.y,lon=lon,lat=lat,garea=g.area))
df=pd.DataFrame(rows)
df['ledger']=df['use']!=''
df['year']=pd.to_numeric(df['approve'].str[:4],errors='coerce')
df['gu']=df['bjd'].str[:5].map({'41171':'만안구','41173':'동안구'})
df['dong']=df['addr'].str.split().str[-1]
df.to_pickle('bldg_old.pkl')
print(df.shape); print(df[['barea','gfa','larea','height','bcr','far','fl_up','fl_dn','garea','year']].describe().T.round(1))
print(df['fl_dn'].value_counts().head(8))

