import json, pandas as pd, numpy as np, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
from shapely.geometry import shape
fp='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'; fm.fontManager.addfont(fp)
plt.rcParams['font.family']=fm.FontProperties(fname=fp).get_name(); plt.rcParams['axes.unicode_minus']=False
NAVY='#1F3864'; BLUE='#2E5597'; RED='#C0392B'; ORANGE='#E67E22'; GRAY='#95A5A6'
A='ana/'
df=pd.read_pickle(A+'bldg_feat.pkl'); L=pd.read_pickle(A+'labeled_oof.pkl'); T=pd.read_pickle(A+'temporal_scores.pkl')
thr=L.oof.quantile(0.9); cand=L[(L.lab==0)&(L.oof>=thr)]

# Fig5 map
hj=json.load(open('../anyang_hjd_31.geojson'))
fig,ax=plt.subplots(figsize=(9,7.2),dpi=160)
for f in hj['features']:
    g=shape(f['geometry'])
    for poly in (g.geoms if g.geom_type=='MultiPolygon' else [g]):
        x,y=poly.exterior.xy; ax.plot(x,y,color='#555',lw=0.6)
ax.scatter(df.lon,df.lat,s=0.4,color='#C8CED3',label=f'건물 {len(df):,}동')
nl=df[~df.ledger]; ax.scatter(nl.lon,nl.lat,s=0.8,color='#7FB3D5',label=f'대장 미연계 {len(nl):,}동')
Y=L[L.lab==1]; ax.scatter(Y.lon,Y.lat,s=2.2,color=RED,label=f'위반건축물 표기 {len(Y):,}동')
ax.scatter(cand.lon,cand.lat,s=2.2,color=ORANGE,marker='^',label=f'AI 우선조사 후보 {len(cand):,}동 (표기 없음·상위 10%)')
ax.set_aspect(1/np.cos(np.radians(37.39))); ax.axis('off')
ax.legend(loc='lower left',fontsize=8.5,markerscale=5,frameon=True)
ax.set_title('안양시 건물통합정보(2026.9.9) — 위반 표기와 AI 후보',fontsize=12,color=NAVY)
plt.savefig('img/map.png',bbox_inches='tight',facecolor='white'); plt.close()

# Fig6 gains curves
def gains(y,s):
    o=np.argsort(-s); c=np.cumsum(y[o])/y.sum(); x=np.arange(1,len(y)+1)/len(y); return x,c
fig,ax=plt.subplots(figsize=(8.4,4.4),dpi=160)
x,c=gains(L.lab.values,L.oof.values); ax.plot(x*100,c*100,color=BLUE,lw=2,label='공간 교차검증(2026.9, 위반 1,573동) AUC 0.73')
x2,c2=gains(T.newY.values,T.s.values); ax.plot(x2*100,c2*100,color=RED,lw=2,label='시간 검증(2025.9 학습 → 1년 내 신규 위반 88동) AUC 0.70')
ax.plot([0,100],[0,100],color=GRAY,ls='--',lw=1,label='무작위 조사')
k1=int(len(x)*0.2)-1; k2=int(len(x2)*0.2)-1
ax.scatter([20],[c[k1]*100],color=BLUE,zorder=3); ax.scatter([20],[c2[k2]*100],color=RED,zorder=3,s=14)
ax.annotate(f'상위 20% → 공간 {c[k1]*100:.0f}% · 시간 {c2[k2]*100:.0f}%',(20,c[k1]*100),xytext=(30,28),textcoords='data',fontsize=9.5,color='#222',arrowprops=dict(arrowstyle='->',color='#777'))
ax.set_xlabel('점수 상위부터 조사한 건물 비율(%)'); ax.set_ylabel('찾아낸 위반 건물 비율(%)')
ax.set_xlim(0,100); ax.set_ylim(0,100); ax.grid(alpha=0.25); ax.legend(fontsize=8.5,loc='lower right')
ax.set_title('상위 20%만 조사해도 위반의 약 47%를 찾는다',fontsize=12,color=NAVY)
ax.spines[['top','right']].set_visible(False)
plt.savefig('img/gains.png',bbox_inches='tight',facecolor='white'); plt.close()

# Fig7 dong table chart
g=df.groupby('dong').agg(n=('ledger','size'),nl=('ledger',lambda s:(~s).sum()))
v=L.groupby('dong').lab.agg(['sum','mean']); g=g.join(v); g['nl_pct']=g.nl/g.n*100; g['v_pct']=g['mean']*100
g=g.sort_values('n',ascending=True)
fig,axs=plt.subplots(1,2,figsize=(9,3.8),dpi=160,sharey=True)
axs[0].barh(g.index,g.nl_pct,color='#7FB3D5'); axs[0].set_title('대장 미연계 비율(%)',fontsize=11)
axs[1].barh(g.index,g.v_pct,color=RED); axs[1].set_title('위반 표기 비율(%, 대장 있는 건물 중)',fontsize=11)
for i,(a,b,n,s) in enumerate(zip(g.nl_pct,g.v_pct,g.nl,g['sum'])):
    axs[0].text(a+0.3,i,f'{a:.1f} ({n:,})',va='center',fontsize=8.5); axs[1].text(b+0.15,i,f'{b:.1f} ({s:,})',va='center',fontsize=8.5)
for a in axs: a.spines[['top','right']].set_visible(False)
axs[0].set_xlim(0,26); axs[1].set_xlim(0,12.5)
fig.suptitle('법정동별 — 건물통합정보 안양 27,713동 직접 집계',fontsize=12,color=NAVY)
plt.tight_layout(); plt.savefig('img/dong.png',bbox_inches='tight',facecolor='white'); plt.close()
g.to_csv('data/dong_summary.csv',encoding='utf-8-sig')
print(g.round(1).to_string())
