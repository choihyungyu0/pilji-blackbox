import pandas as pd, numpy as np
from sklearn.neighbors import BallTree
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score, average_precision_score
old=pd.read_pickle('bldg_old.pkl').rename(columns={'x':'cx','y':'cy'})
new=pd.read_pickle('bldg.pkl')[['A0','viol']].rename(columns={'viol':'viol_new'})
old=old.merge(new,on='A0')
XY=old[['cx','cy']].values; tree=BallTree(XY)
nl=old[~old.ledger]; tnl=BallTree(nl[['cx','cy']].values)
old['n_bld50']=tree.query_radius(XY,50,count_only=True)-1
old['n_nl30']=tnl.query_radius(XY,30,count_only=True)-(~old.ledger).astype(int)
old['foot_ratio']=np.where(old.barea>0,old.garea/old.barea,np.nan)
old['age']=2025-old.year
L=old[old.ledger & old.viol.isin(['Y','N'])].copy()
L['lab']=(L.viol=='Y').astype(int)
Lxy=L[['cx','cy']].values; tt=BallTree(Lxy); ind=tt.query_radius(Lxy,100)
yl=L.lab.values
L['nb_viol']=[(yl[ii[ii!=k]].mean() if len(ii)>1 else np.nan) for k,ii in enumerate(ind)]
top_use=L.use.value_counts().index[:10]; top_st=L.struct.value_counts().index[:8]
def feats(D):
    X=pd.DataFrame(index=D.index)
    for c in ['age','fl_up','fl_dn','gfa','larea','bcr','far','height','garea','foot_ratio','n_bld50','n_nl30','nb_viol']: X[c]=D[c]
    X['san']=(D.san=='산').astype(int); X['manan']=(D.gu=='만안구').astype(int)
    for u in top_use: X['use_'+u]=(D.use==u).astype(int)
    for s in top_st: X['st_'+s]=(D.struct==s).astype(int)
    return X
X=feats(L)
m=HistGradientBoostingClassifier(max_iter=300,learning_rate=0.05,random_state=0).fit(X,yl)
T=L[L.lab==0].copy()   # 2025.9 기준 위반 아님
T['s']=m.predict_proba(X.loc[T.index])[:,1]
T['newY']=(T.viol_new=='Y').astype(int)
y=T.newY.values; s=T.s.values
print('test N', len(T), 'newY', y.sum(), 'base', round(y.mean(),5))
print('temporal AUC', round(roc_auc_score(y,s),3), 'AP', round(average_precision_score(y,s),4))
o=np.argsort(-s)
for q in [0.01,0.05,0.1,0.2]:
    k=int(len(y)*q); hit=y[o[:k]].sum(); print(f'top{q*100:.0f}% ({k}동): 신규위반 {hit}/{y.sum()} = recall {hit/y.sum():.3f}, lift {hit/k/y.mean():.2f}')
# baseline: nb_viol only, random
nb=T.nb_viol.fillna(0).values
print('nb_viol-only AUC', round(roc_auc_score(y,nb),3))
print('age-only AUC', round(roc_auc_score(y,T.age.fillna(T.age.median())),3))
T[['A0','pnu','addr','jibun','use','year','s','newY','dong','lon','lat']].to_pickle('temporal_scores.pkl')
print(T[T.newY==1].dong.value_counts().to_string())
print(T[T.newY==1].use.value_counts().head(6).to_string())
