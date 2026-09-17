import json, re, numpy as np, pandas as pd
from sklearn.neighbors import BallTree
from sklearn.metrics import roc_auc_score, average_precision_score
from pyproj import Transformer
from shapely.geometry import shape, mapping
from shapely.ops import transform
H='../handoff/data/'
df=pd.read_pickle('bldg_feat.pkl'); L=pd.read_pickle('labeled_oof.pkl'); T=pd.read_pickle('temporal_scores.pkl')
t5=float(L.oof.quantile(0.95)); t10=float(L.oof.quantile(0.9))
# neighbor violation share (100m, labeled, excl self)
lab=df[df.ledger & df.viol.isin(['Y','N'])]
tt=BallTree(lab[['cx','cy']].values); yv=(lab.viol=='Y').astype(int).values
ind=tt.query_radius(df[['cx','cy']].values,100)
self_pos={a:i for i,a in enumerate(lab.A0)}
nbv=[]
for k,ii in enumerate(ind):
    sp=self_pos.get(df.A0.iloc[k]); ii=ii[ii!=sp] if sp is not None else ii
    nbv.append(round(float(yv[ii].mean()),3) if len(ii) else None)
df['nbv']=nbv
sc=L.set_index('A0').oof
# enhanced geojson
SRC='/mnt/user-data/uploads/Downloads/안양시_경진대회_리서치/raw/anyang_bldg_20260909_5186.geojson'
d=json.load(open(SRC,encoding='utf-8'))
tr=Transformer.from_crs(5186,4326,always_xy=True).transform
D=df.set_index('A0')
def nz(v,f=None):
    if v is None or (isinstance(v,float) and np.isnan(v)): return None
    return f(v) if f else v
feats=[]
for f in d['features']:
    a=f['properties']['A0']; r=D.loc[a]
    raw=sc.get(a); raw=None if raw is None or np.isnan(raw) or r.viol!='N' else float(raw)
    s=None if raw is None else round(raw,4)
    cand = raw is not None and r.viol=='N' and raw>=t10
    grade = ('A' if raw>=t5 else 'B') if cand else ('C' if raw is not None else None)
    p=dict(id=int(a),pnu=r.pnu,bjd=r.bjd,dong=r.dong,jibun=r.jibun,san=r.san,use=r.use or None,struct=r.struct or None,
      year=nz(r.year,int),fl_up=nz(r.fl_up,int),fl_dn=nz(r.fl_dn,int),h=nz(r.height,lambda v:round(v,1)) if (not pd.isna(r.height) and r.height<=300) else None,
      gfa=nz(r.gfa,lambda v:round(v,1)),viol=r.viol or None,ledger=bool(r.ledger),chg=r.chg or None,approve=r.approve or None,
      score=s,cand=bool(cand),grade=grade,
      f_nbv=r.nbv,f_age=nz(r.age,int),f_footratio=nz(r.foot_ratio,lambda v:round(v,2)),f_nb50=int(r.n_bld50),f_nl30=int(r.n_nl30),
      lon=round(r.lon,6),lat=round(r.lat,6))
    g=transform(tr,shape(f['geometry']))
    feats.append({'type':'Feature','properties':p,'geometry':mapping(g)})
s=json.dumps({'type':'FeatureCollection','name':'anyang_bldg_scored_20260909','crs_note':'EPSG:4326','features':feats},ensure_ascii=False,separators=(',',':'))
s=re.sub(r'(\d+\.\d{7})\d+',r'\1',s)
open(H+'anyang_bldg_scored_20260909_4326.geojson','w',encoding='utf-8').write(s)
print('geojson MB',len(s.encode())/1e6, 'cand',sum(x['properties']['cand'] for x in feats),'A',sum(x['properties']['grade']=='A' for x in feats))
# candidates csv
c=df[df.A0.astype(int).isin([x['properties']['id'] for x in feats if x['properties']['cand']])].copy()
c['raw']=c.A0.map(sc); c['score']=c.raw.round(4); c['grade']=np.where(c.raw>=t5,'A','B')
c=c.sort_values('raw',ascending=False)
c[['A0','pnu','dong','jibun','use','year','fl_up','fl_dn','score','grade','nbv','age','lon','lat']].rename(columns={'A0':'id','nbv':'f_nbv','age':'f_age'}).round({'lon':6,'lat':6}).to_csv(H+'candidates_1918_20260909.csv',index=False,encoding='utf-8-sig')
# changes
old=pd.read_pickle('bldg_old.pkl')[['A0','viol','use','approve']]; new=df[['A0','viol','pnu','dong','jibun','use','lon','lat']]
m=new.merge(old,on='A0',how='left',suffixes=('','_old'))
ch=[]
for _,r in m.iterrows():
    if pd.isna(r.viol_old): typ='new_building'
    elif r.viol_old=='N' and r.viol=='Y': typ='viol_added'
    elif r.viol_old=='Y' and r.viol=='N': typ='viol_cleared'
    else: continue
    ch.append(dict(id=int(r.A0),type=typ,pnu=r.pnu,dong=r.dong,jibun=r.jibun,use=r.use or None,lon=round(r.lon,6),lat=round(r.lat,6),from_date='2025-09-04',to_date='2026-09-09',source='GIS건물통합정보 월별 전체본(브이월드) 두 시점 A20 비교'))
json.dump({'snapshots':['2025-09-04','2026-09-09'],'counts':pd.Series([x['type'] for x in ch]).value_counts().to_dict(),'changes':ch},open(H+'changes_20250904_20260909.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
print(pd.Series([x['type'] for x in ch]).value_counts().to_dict())
# metrics
def gains(y,s,n=101):
    o=np.argsort(-s); cum=np.cumsum(y[o])/y.sum(); xs=np.linspace(0,1,n)
    return [[round(float(x),2), round(float(cum[max(0,int(x*len(y))-1)]) if x>0 else 0.0,4)] for x in xs]
y=L.lab.values; s=L.oof.values; yt=T.newY.values; st=T.s.values
def lift(y,s,q):
    o=np.argsort(-s); k=int(len(y)*q); return dict(top=q,n=k,hits=int(y[o[:k]].sum()),recall=round(float(y[o[:k]].sum()/y.sum()),3),lift=round(float(y[o[:k]].mean()/y.mean()),2))
M=dict(asof='2026-09-09',label='GIS건물통합정보 A20 위반건축물여부=Y',
  model='sklearn HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, max_leaf_nodes=31)',
  features=['age','fl_up','fl_dn','gfa','larea','bcr','far','height','garea','foot_ratio','n_bld50','n_nl30','nb_viol(100m, 학습fold만)','san','manan','use_top10 원핫','struct_top8 원핫'],
  spatial_cv=dict(design='500m 격자 GroupKFold 5',n=int(len(y)),positives=int(y.sum()),base=round(float(y.mean()),4),auc=round(float(roc_auc_score(y,s)),3),ap=round(float(average_precision_score(y,s)),3),lifts=[lift(y,s,q) for q in (0.05,0.1,0.2)],gains=gains(y,s)),
  temporal=dict(design='2025-09-04 스냅숏 전체 학습 → 당시 N인 건물 중 2026-09-09 Y 전환 예측',n=int(len(yt)),positives=int(yt.sum()),base=round(float(yt.mean()),4),auc=round(float(roc_auc_score(yt,st)),3),ap=round(float(average_precision_score(yt,st)),4),lifts=[lift(yt,st,q) for q in (0.01,0.05,0.1,0.2)],gains=gains(yt,st),baseline_auc=dict(nb_viol_only=0.616,age_only=0.429)),
  thresholds=dict(cand_top10=round(t10,4),gradeA_top5=round(t5,4)),
  candidates=dict(total=1918,A=913,B=1005),
  permutation_importance_auc=[['nb_viol',0.0908],['age',0.0436],['use_공동주택',0.0386],['gfa',0.0273],['garea',0.0249],['foot_ratio',0.0236],['bcr',0.017],['n_bld50',0.0151],['st_벽돌구조',0.0132],['fl_up',0.0108]],
  s1_association=dict(desc='반경 20m 내 대장 미연계 건물 유무별 위반 표기 비율',with_=0.077,without=0.0648,rr=1.19,p=0.0062),
  limits=['라벨은 이미 적발된 위반만 포함','이웃 위반 비율 의존 → 과거 단속 지역 편향 가능','시간 검증 AP 0.008 — 후보 대부분은 위반 아님','대장 미연계 건물은 점수 대상 아님'])
json.dump(M,open(H+'model_metrics.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
print(M['spatial_cv']['auc'],M['temporal']['auc'])
