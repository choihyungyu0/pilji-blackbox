import pandas as pd, numpy as np
from scipy.stats import chi2_contingency
from sklearn.neighbors import BallTree
L=pd.read_pickle('labeled_oof.pkl'); df=pd.read_pickle('bldg_feat.pkl')
nl=df[~df.ledger]; tnl=BallTree(nl[['cx','cy']].values)
c=tnl.query_radius(L[['cx','cy']].values,20,count_only=True)>0
t=pd.crosstab(c,L.lab); chi=chi2_contingency(t); 
p1=L.lab[c].mean(); p0=L.lab[~c].mean()
print('S1 near(20m) Y-rate',round(p1,4),'vs',round(p0,4),'RR',round(p1/p0,2),'p',chi[1])
L['dec']=(L.year//10*10)
print(L.groupby('dec').lab.agg(['count','mean']).round(3).to_string())
fr=L.foot_ratio
for th in [1.1,1.3,1.5]:
    a=fr>th; print('foot_ratio>',th,'n',a.sum(),'Yrate',round(L.lab[a].mean(),3),'else',round(L.lab[(fr<=th)].mean(),3))
print(L.groupby('use').lab.agg(['count','mean']).sort_values('count',ascending=False).head(8).round(3).to_string())
print(L.groupby('fl_dn').lab.agg(['count','mean']).head(4).round(3).to_string())
# candidates: not flagged with high OOF score
N=L[L.lab==0].sort_values('oof',ascending=False)
thr=L.oof.quantile(0.9)
cand=N[N.oof>=thr]
print('candidates (N, oof>=p90):',len(cand),'thr',round(thr,3))
print(cand.groupby('dong').size().sort_values(ascending=False).to_string())
print(cand.use.value_counts().head(5).to_string())
# S1 counts by dong + ratio
g=df.groupby('dong').agg(n=('ledger','size'),noledger=('ledger',lambda s:(~s).sum()))
g['pct']=(g.noledger/g.n*100).round(1)
v=L.groupby('dong').lab.agg(['sum','mean']); g=g.join(v)
print(g.sort_values('n',ascending=False).to_string())
# noledger on 산 parcels / sizes
print('noledger san', (nl.san=='산').sum(), 'noledger area median', nl.garea.median())
cand.to_pickle('cand.pkl')
