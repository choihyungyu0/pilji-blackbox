import pandas as pd, numpy as np
from sklearn.neighbors import BallTree
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.model_selection import GroupKFold
from sklearn.metrics import roc_auc_score, average_precision_score
df=pd.read_pickle('bldg.pkl').rename(columns={'x':'cx','y':'cy'})
XY=df[['cx','cy']].values
tree=BallTree(XY)
nl=df[~df.ledger]; tnl=BallTree(nl[['cx','cy']].values)
df['n_bld50']=tree.query_radius(XY,50,count_only=True)-1
df['n_nl30']=tnl.query_radius(XY,30,count_only=True)-(~df.ledger).astype(int)
df['foot_ratio']=np.where(df.barea>0, df.garea/df.barea, np.nan)
df['age']=2026-df.year
L=df[df.ledger & df.viol.isin(['Y','N'])].copy()
L['lab']=(L.viol=='Y').astype(int)
print('labeled',len(L),'Y',L.lab.sum(),'rate',round(L.lab.mean(),4))
# association: noledger near Y vs N
for r in [10,20,30]:
    c=tnl.query_radius(L[['cx','cy']].values,r,count_only=True)
    a=(c>0)
    print(f'noledger within {r}m: Y {a[L.lab==1].mean():.3f}  N {a[L.lab==0].mean():.3f}')
top_use=L.use.value_counts().index[:10]; top_st=L.struct.value_counts().index[:8]
def feats(D):
    X=pd.DataFrame(index=D.index)
    for c in ['age','fl_up','fl_dn','gfa','larea','bcr','far','height','garea','foot_ratio','n_bld50','n_nl30']: X[c]=D[c]
    X['san']=(D.san=='산').astype(int); X['manan']=(D.gu=='만안구').astype(int)
    for u in top_use: X['use_'+u]=(D.use==u).astype(int)
    for s in top_st: X['st_'+s]=(D.struct==s).astype(int)
    return X
X=feats(L); y=L.lab.values
grp=((L.cx//500).astype(int)*1000+(L.cy//500).astype(int)).values
oof=np.zeros(len(L)); gkf=GroupKFold(n_splits=5)
Lxy=L[['cx','cy']].values; 
for tr,te in gkf.split(X,y,grp):
    # neighbor violation share from training fold only
    tt=BallTree(Lxy[tr]); ytr=y[tr]
    def nshare(idx_pts, excl_self):
        ind=tt.query_radius(idx_pts,100)
        out=[]
        for k,ii in enumerate(ind):
            if excl_self: ii=ii[ii!=k] if False else ii
            out.append(ytr[ii].mean() if len(ii) else np.nan)
        return np.array(out)
    Xtr=X.iloc[tr].copy(); Xte=X.iloc[te].copy()
    # for train rows exclude self
    ind=tt.query_radius(Lxy[tr],100); Xtr['nb_viol']=[ (ytr[ii[ii!=k]].mean() if len(ii)>1 else np.nan) for k,ii in enumerate(ind)]
    Xte['nb_viol']=nshare(Lxy[te],False)
    m=HistGradientBoostingClassifier(max_iter=300,learning_rate=0.05,max_leaf_nodes=31,random_state=0)
    m.fit(Xtr,y[tr]); oof[te]=m.predict_proba(Xte)[:,1]
auc=roc_auc_score(y,oof); ap=average_precision_score(y,oof)
order=np.argsort(-oof)
def lift(q):
    k=int(len(y)*q); return y[order[:k]].mean()/y.mean(), y[order[:k]].sum()/y.sum()
print('spatial 5-fold AUC',round(auc,3),'AP',round(ap,3),'base',round(y.mean(),3))
for q in [0.05,0.1,0.2]:
    l,rc=lift(q); print(f'top{int(q*100)}%: lift {l:.2f}, recall {rc:.3f}')
# baseline: age only
print('age-only AUC', round(roc_auc_score(y, L.age.fillna(L.age.median())),3))
L['oof']=oof; L.to_pickle('labeled_oof.pkl'); df.to_pickle('bldg_feat.pkl')
# feature importance via permutation on a full fit
from sklearn.inspection import permutation_importance
tt=BallTree(Lxy); ind=tt.query_radius(Lxy,100); X['nb_viol']=[(y[ii[ii!=k]].mean() if len(ii)>1 else np.nan) for k,ii in enumerate(ind)]
m=HistGradientBoostingClassifier(max_iter=300,learning_rate=0.05,random_state=0).fit(X,y)
pi=permutation_importance(m,X,y,scoring='roc_auc',n_repeats=3,random_state=0)
imp=pd.Series(pi.importances_mean,index=X.columns).sort_values(ascending=False)
print(imp.head(12).round(4))
import pickle; pickle.dump((m,list(X.columns)),open('model_full.pkl','wb'))
