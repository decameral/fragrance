"""Build editable coursework diagrams and matching PNGs (Python + Pillow).

Run from any directory. No database connection or application dependencies needed.
"""
from pathlib import Path
import copy
import heapq
import math
import re
import zipfile
import xml.etree.ElementTree as E
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/diagrams'
OUT.mkdir(parents=True, exist_ok=True)
FONT = Path('C:/Windows/Fonts/arial.ttf')
if not FONT.exists():
    FONT = Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')


def font(size):
    return ImageFont.truetype(str(FONT), size)


class Page:
    def __init__(self, name, width, height):
        self.name, self.w, self.h = name, width, height
        self.nodes, self.edges, self.labels = {}, [], []
        self.used = set()
        self.ports_used = set()

    def node(self, key, title, x, y, w, h, kind='rect', rows=None, fs=16, underline=False):
        assert key not in self.nodes
        self.nodes[key] = dict(id=key, title=title, x=x, y=y, w=w, h=h,
                               kind=kind, rows=rows, fs=fs, underline=underline)
        return key

    def box(self, key, title, rows, x, y, w=320, fs=16):
        h = math.ceil((40 + 24 * len(rows)) / 10) * 10
        return self.node(key, title, x, y, w, h, rows=rows, fs=fs)

    def label(self, text, x, y, size=14):
        self.labels.append((text, x, y, size))

    def route(self, a, b):
        # Grid routing keeps connectors outside boxes; used segments cost more.
        def ports(n):
            x,y,w,h = (n[k] for k in ('x','y','w','h'))
            candidates = [(x,y+v) for v in range(30,h-19,30)] + [(x+w,y+v) for v in range(30,h-19,30)] + [(x+v,y) for v in range(30,w-19,30)] + [(x+v,y+h) for v in range(30,w-19,30)]
            return [p for p in candidates if all(math.dist(p,q)>=30 for q in self.ports_used)]
        pairs=sorted(((math.dist(p,q),p,q) for p in ports(self.nodes[a]) for q in ports(self.nodes[b])))
        blocked=set()
        for n in self.nodes.values():
            if n['kind'] in ('frame','text'): continue
            for x in range(int(n['x'])+10,int(n['x']+n['w']),10):
                for y in range(int(n['y'])+10,int(n['y']+n['h']),10): blocked.add((x,y))
        for _,start,end in pairs:
            todo=[(0,0,start,None)]; costs={(start,None):0}; prev={}; last=None
            while todo:
                _,cost,p,d=heapq.heappop(todo)
                if cost != costs.get((p,d)): continue
                if p==end: last=(p,d);break
                for nd,(dx,dy) in enumerate(((10,0),(0,10),(-10,0),(0,-10))):
                    q=(p[0]+dx,p[1]+dy)
                    if not (20<=q[0]<=self.w-20 and 20<=q[1]<=self.h-40) or q in blocked: continue
                    # Do not run along a node border, except while entering/leaving.
                    if q not in (start,end) and any(n['kind'] not in ('frame','text') and n['x']<=q[0]<=n['x']+n['w'] and n['y']<=q[1]<=n['y']+n['h'] for n in self.nodes.values()): continue
                    nc=cost+10+(18 if d is not None and d!=nd else 0)+(90 if q in self.used else 0)
                    state=(q,nd)
                    if nc<costs.get(state,10**12):
                        costs[state]=nc;prev[state]=(p,d)
                        heapq.heappush(todo,(nc+abs(q[0]-end[0])+abs(q[1]-end[1]),nc,q,nd))
            if last:
                points=[]
                while last in prev: points.append(last[0]);last=prev[last]
                points.append(start);points.reverse();self.used.update(points[2:-2]);self.ports_used.update((start,end))
                short=[points[0]]
                for i in range(1,len(points)-1):
                    if (points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]) != (points[i+1][0]-points[i][0],points[i+1][1]-points[i][1]): short.append(points[i])
                return short+[points[-1]]
        raise AssertionError(('No route',a,b))

    def edge(self,a,b,points=None,kind='line',label='',multiplicity=None):
        points=points or self.route(a,b)
        self.edges.append(dict(a=a,b=b,pts=points,kind=kind,label=label,multi=multiplicity))

    def output(self, filename):
        mx=E.Element('mxfile',host='app.diagrams.net')
        di=E.SubElement(mx,'diagram',id=filename,name=self.name)
        m=E.SubElement(di,'mxGraphModel',page='1',pageScale='1',pageWidth=str(self.w),pageHeight=str(self.h),grid='1',gridSize='10',background='#ffffff')
        root=E.SubElement(m,'root');E.SubElement(root,'mxCell',id='0');E.SubElement(root,'mxCell',id='1',parent='0')
        im=Image.new('RGB',(self.w,self.h),'white');d=ImageDraw.Draw(im)

        def cell(key,text,x,y,w,h,style,parent='1'):
            c=E.SubElement(root,'mxCell',id=key,value=text,vertex='1',parent=parent,style=style+'fontFamily=Arial;fontColor=#000000;')
            E.SubElement(c,'mxGeometry',x=str(x),y=str(y),width=str(w),height=str(h),attrib={'as':'geometry'})

        def text(key,txt,x,y,w,h,fs=16,align='center',underline=False,parent='1',absolute=None):
            cell(key,txt,x,y,w,h,f'text;html=0;strokeColor=none;fillColor=none;align={align};verticalAlign=middle;fontSize={fs};fontStyle={4 if underline else 0};',parent)
            ax,ay=absolute or (x,y)
            for i,line in enumerate(txt.split('\n')):
                assert d.textlength(line,font=font(fs)) <= w-4,(filename,txt,w)
                yy=ay+h/2+(i-(len(txt.split('\n'))-1)/2)*(fs+3)
                xx=ax+w/2 if align=='center' else ax+4
                d.text((xx,yy),line,font=font(fs),fill='black',anchor='mm' if align=='center' else 'lm')
                if underline:
                    length=d.textlength(line,font=font(fs));d.line((xx-length/2,yy+fs/2,xx+length/2,yy+fs/2),fill='black')

        # Frame lies behind the use cases and their connections.
        for n in self.nodes.values():
            if n['kind']=='frame':
                x,y,w,h=(n[k] for k in ('x','y','w','h'))
                cell(n['id'],'',x,y,w,h,'fillColor=none;strokeColor=#000000;')
                d.rectangle((x,y,x+w,y+h),outline='black',width=2)
                text(n['id']+'title',n['title'],x,y+5,w,30,18)
        for i,e in enumerate(self.edges):
            pts=e['pts'];a=self.nodes[e['a']];b=self.nodes[e['b']]
            kind=e['kind']; arrow='open' if kind in ('arrow','dependency') else 'block' if kind=='generalization' else 'none'
            style=f'endArrow={arrow};endFill=0;startArrow=none;strokeColor=#000000;strokeWidth=1.3;rounded=0;html=0;'
            if kind=='dependency':style+='dashed=1;'
            if kind.startswith('crow'):style+=f'startArrow={"ERzeroToOne" if kind=="crow_optional" else "ERone"};endArrow=ERzeroToMany;startFill=0;endFill=0;'
            style+=f'exitX={(pts[0][0]-a["x"])/a["w"]};exitY={(pts[0][1]-a["y"])/a["h"]};entryX={(pts[-1][0]-b["x"])/b["w"]};entryY={(pts[-1][1]-b["y"])/b["h"]};exitPerimeter=0;entryPerimeter=0;'
            c=E.SubElement(root,'mxCell',id=f'e{i}',edge='1',parent='1',source=e['a'],target=e['b'],style=style)
            g=E.SubElement(c,'mxGeometry',relative='1',attrib={'as':'geometry'});arr=E.SubElement(g,'Array',attrib={'as':'points'})
            for x,y in pts[1:-1]:E.SubElement(arr,'mxPoint',x=str(x),y=str(y))
            for p,q in zip(pts,pts[1:]):
                length=math.dist(p,q)
                if kind=='dependency':
                    for k in range(0,int(length),12):d.line([(p[0]+(q[0]-p[0])*min(z/length,1),p[1]+(q[1]-p[1])*min(z/length,1)) for z in (k,k+7)],fill='black',width=2)
                else:d.line([p,q],fill='black',width=2)
            if arrow!='none':
                p,q=pts[-2:];angle=math.atan2(q[1]-p[1],q[0]-p[0]);tri=[q,(q[0]-13*math.cos(angle-.5),q[1]-13*math.sin(angle-.5)),(q[0]-13*math.cos(angle+.5),q[1]-13*math.sin(angle+.5))]
                if arrow=='block':d.polygon(tri,fill='white',outline='black',width=2)
                else:d.line([tri[1],q,tri[2]],fill='black',width=2)
            if kind.startswith('crow'):
                for many,point,inner in [(False,pts[0],pts[1]),(True,pts[-1],pts[-2])]:
                    length=math.dist(point,inner);ux=(inner[0]-point[0])/length;uy=(inner[1]-point[1])/length
                    def q(t,v=0):return point[0]+t*ux-v*uy,point[1]+t*uy+v*ux
                    if many:
                        d.line([q(1,-6),q(12),q(1,6)],fill='black',width=2)
                    else:d.line([q(6,-6),q(6,6)],fill='black',width=2)
                    if many or kind=='crow_optional':
                        x,y=q(20);d.ellipse((x-4,y-4,x+4,y+4),fill='white',outline='black',width=2)
                    else:d.line([q(12,-6),q(12,6)],fill='black',width=2)
            if e['label']:
                p,q=max(zip(pts,pts[1:]),key=lambda v:math.dist(*v));self.label(e['label'],(p[0]+q[0])/2,(p[1]+q[1])/2+ (35 if e['label']=='to_status' and p[0]==q[0] else -35 if e['label']=='from_status' and p[0]==q[0] else -13),13)
            if e['multi']:
                for val,p,q in [(e['multi'][0],pts[0],pts[1]),(e['multi'][1],pts[-1],pts[-2])]:
                    length=math.dist(p,q);x=p[0]+(q[0]-p[0])/length*28;y=p[1]+(q[1]-p[1])/length*28
                    self.label(val,x+(27 if p[0]==q[0] else 0),y+(0 if p[0]==q[0] else 14),13)
        for n in self.nodes.values():
            x,y,w,h=(n[k] for k in ('x','y','w','h'));kind=n['kind'];key=n['id'];fs=n['fs']
            if kind=='frame':continue
            shape={'oval':'ellipse','diamond':'rhombus','actor':'umlActor','terminal':'ellipse','text':'text'}.get(kind,'rectangle')
            style=f'shape={shape};html=0;fillColor=#ffffff;strokeColor=#000000;fontSize={fs};'
            cell(key,'',x,y,w,h,style)
            if kind in ('oval','terminal'):d.ellipse((x,y,x+w,y+h),fill='white',outline='black',width=2)
            elif kind=='diamond':d.polygon([(x+w/2,y),(x+w,y+h/2),(x+w/2,y+h),(x,y+h/2)],fill='white',outline='black',width=2)
            elif kind=='actor':
                cx=x+w/2;d.ellipse((cx-12,y,cx+12,y+24),outline='black',width=2);d.line([(cx,y+24),(cx,y+65)],fill='black',width=2);d.line([(cx-26,y+40),(cx+26,y+40)],fill='black',width=2);d.line([(cx-24,y+90),(cx,y+65),(cx+24,y+90)],fill='black',width=2)
            elif kind!='text':d.rectangle((x,y,x+w,y+h),fill='white',outline='black',width=2)
            if n['rows'] is not None:
                text(key+'title',n['title'],0,0,w,36,fs,parent=key,absolute=(x,y))
                d.line((x,y+36,x+w,y+36),fill='black')
                cell(key+'sep','',0,36,w,0,'shape=line;strokeColor=#000000;',key)
                for j,row in enumerate(n['rows']):
                    yy=40+j*24
                    if row=='':
                        d.line((x,y+yy+10,x+w,y+yy+10),fill='black');cell(key+f'sep{j}','',0,yy+10,w,0,'shape=line;strokeColor=#000000;',key)
                    else:text(key+f'r{j}',row,5,yy,w-10,24,fs,'left',parent=key,absolute=(x+5,y+yy))
            elif kind=='actor':text(key+'title',n['title'],-30,h+4,w+60,30,fs,parent=key,absolute=(x-30,y+h+4))
            else:text(key+'title',n['title'],2,0,w-4,h,fs,underline=n['underline'],parent=key,absolute=(x+2,y))
        for i,(txt,x,y,fs) in enumerate(self.labels):
            w=d.textlength(txt,font=font(fs))+12;h=fs+6
            d.rectangle((x-w/2,y-h/2,x+w/2,y+h/2),fill='white')
            cell(f'labelbg{i}','',x-w/2,y-h/2,w,h,'strokeColor=none;fillColor=#ffffff;')
            text(f'label{i}',txt,x-w/2,y-h/2,w,h,fs)
        # Geometric and XML checks include every node and connector endpoint.
        for n in self.nodes.values():
            assert n['x']>=0 and n['y']>=0 and n['x']+n['w']<=self.w and n['y']+n['h']<=self.h,n
        ids=[c.get('id') for c in root];assert len(ids)==len(set(ids))
        for e in self.edges:
            for p,q in zip(e['pts'],e['pts'][1:]):
                for n in self.nodes.values():
                    if n['id'] in (e['a'],e['b']) or n['kind'] in ('frame','text'):continue
                    for t in range(1,100):
                        x=p[0]+(q[0]-p[0])*t/100;y=p[1]+(q[1]-p[1])*t/100
                        assert not(n['x']+1<x<n['x']+n['w']-1 and n['y']+1<y<n['y']+n['h']-1),(filename,e['a'],e['b'],n['id'])
        E.indent(mx);E.ElementTree(mx).write(OUT/(filename+'.drawio'),encoding='utf-8',xml_declaration=True)
        im.save(OUT/(filename+'.png'))
        return di


sql=(ROOT/'db/schema.sql').read_text(encoding='utf-8')
bodies=dict(re.findall(r'CREATE TABLE `(\w+)` \((.*?)\n\) ENGINE',sql,re.S))
fields={};keys={};fks=[]
for table,body in bodies.items():
    fields[table]={m[0]:(m[1], 'NOT NULL' not in m[2]) for m in re.findall(r'^  `(\w+)` ([a-z]+(?:\([\d,]+\))?(?: unsigned)?)([^\n]*)',body,re.M)}
    keys[table]=re.findall(r'`(\w+)`',re.search(r'PRIMARY KEY \((.*?)\)',body)[1])
    for col,parent,ref in re.findall(r'FOREIGN KEY \(`(\w+)`\) REFERENCES `(\w+)` \(`(\w+)`\)',body): fks.append((table,col,parent,ref))
assert len(bodies)==15


def database(physical):
    p=Page('Physical database — MySQL 8' if physical else 'Logical database',2100,1590)
    layout=[['roles','users','orders','order_statuses'],
            ['order_status_transitions','cart_items','order_items','order_status_history'],
            ['accent_categories','accents','atmospheres','bottles'],
            ['sessions','schema_migrations','atmosphere_accents']]
    selected={
        'roles':['code','title'],'users':['id','name','email','role'],
        'orders':['id','user_id','checkout_key','status','total_minor','created_at'],
        'order_statuses':['code','title'],'order_status_transitions':['from_status','to_status','role_code'],
        'cart_items':['id','user_id','atmosphere_id','accent_id','bottle_id','perfume_name','quantity'],
        'order_items':['id','order_id','atmosphere_id','accent_id','bottle_id','perfume_name','quantity','unit_minor'],
        'order_status_history':['id','order_id','from_status','to_status','actor_id','event_kind','changed_at'],
        'accent_categories':['name'],'accents':['id','name','category','price_per_ml','active'],
        'atmospheres':['id','title','base_accord','price_per_ml','active'],
        'bottles':['id','name','volume_ml','price','active'],
        'sessions':['sid','expires','data'],'schema_migrations':['name','applied_at'],
        'atmosphere_accents':['atmosphere_id','accent_id']}
    for r,line in enumerate(layout):
        for c,name in enumerate(line):
            fkcols=[v[1] for v in fks if v[0]==name];rows=[]
            assert set(keys[name]+fkcols)<=set(selected[name])
            for col in selected[name]:
                typ,nullable=fields[name][col]
                prefix='/'.join(v for v,ok in [('PK',col in keys[name]),('FK',col in fkcols)] if ok)
                rows.append((prefix+' ' if prefix else '')+col+(' : '+typ if physical else '')+(' ?' if nullable else ''))
            p.box(name,name,rows,60+c*520,80+r*370,400,15)
    for table,col,parent,ref in fks:
        p.edge(parent,table,kind='crow_optional' if fields[table][col][1] else 'crow',label=col if col in ('from_status','to_status') else '')
    p.label('PK = primary key; FK = foreign key; ? = nullable. Selected fields; all 15 tables and all foreign keys.',1050,1510,17)
    p.label('Crow\'s foot: parent 1 (or 0..1 for nullable FK), child 0..*. Full constraints: db/schema.sql.',1050,1540,17)
    assert len(p.edges)==len(fks)
    return p.output('physical' if physical else 'logical')


def classes():
    p=Page('Classes — domain analysis model (A3)',1587,1123)
    items=[
      ('User',['− id: Integer','− email: String'],['+ login()','+ logout()'],0,0),
      ('Order',['− id: Integer','− status: String','− totalMinor: Integer'],['+ cancel()','+ repeat()'],1,0),
      ('OrderItem',['− perfumeName: String','− quantity: Integer','− unitMinor: Integer'],[],2,0),
      ('Bottle',['− id: Integer','− volumeMl: Integer','− price: Decimal'],[],3,0),
      ('CartItem',['− perfumeName: String','− quantity: Integer'],['+ changeQuantity()'],0,1),
      ('Atmosphere',['− id: String','− title: String','− pricePerMl: Decimal'],[],1,1),
      ('Accent',['− id: String','− name: String','− pricePerMl: Decimal'],[],2,1),
      ('StatusEvent',['− fromStatus: String?','− toStatus: String','− changedAt: DateTime'],[],3,1),
      ('CheckoutControl',[],['+ quote()','+ checkout()'],0,2),
      ('CatalogControl',[],['+ save()','+ compatibility()','+ importCatalog()'],1,2),
      ('ReportControl',[],['+ statistics()','+ csv()'],2,2),
      ('OrderControl',[],['+ changeStatus()'],3,2)]
    for name,attrs,methods,c,r in items:
        p.box(name,('«control» ' if name.endswith('Control') else '«entity» ')+name,attrs+(['']+methods if methods else []),30+c*390,60+r*360,310,15)
    for a,b,label,ma,mb in [('User','Order','places','1','0..*'),('Order','OrderItem','contains','1','1..*'),('Bottle','OrderItem','selected in','1','0..*'),('User','CartItem','owns','1','0..*'),('Atmosphere','Accent','matches','0..*','0..*'),('Order','StatusEvent','has','1','1..*')]:
        routes={('User','Order'):[(340,140),(420,140)],('Order','OrderItem'):[(730,140),(810,140)],('Bottle','OrderItem'):[(1200,140),(1120,140)],('User','CartItem'):[(190,220),(190,420)],('Atmosphere','Accent'):[(730,480),(810,480)],('Order','StatusEvent'):[(670,250),(670,330),(1360,330),(1360,420)]}
        p.edge(a,b,routes[(a,b)],label=label,multiplicity=(ma,mb))
    for a,b in [('CheckoutControl','CartItem'),('CatalogControl','Atmosphere'),('CatalogControl','Accent'),('ReportControl','OrderItem'),('OrderControl','StatusEvent')]:p.edge(a,b,kind='dependency')
    p.label('Analysis model, not JavaScript classes or ORM. Selected associations and responsibilities.',790,1060,16)
    return p.output('classes-A3')


def chen():
    p=Page('ER — нотация Чена',1800,1500)
    # A conceptual subset, like the reference; join tables are relationships.
    entities=[('user','Пользователь','Код','Почта',100,200),('order','Заказ','Номер','Сумма',740,200),
              ('item','Позиция заказа','Код','Количество',1380,200),('bottle','Флакон','Код','Объём',1380,790),
              ('atm','Атмосфера','Код','Название',740,790),('accent','Акцент','Код','Название',100,790),
              ('category','Категория','Название',None,100,1280)]
    for key,title,pk,attr,x,y in entities:
        p.node(key,title,x,y,220,70,fs=20)
        p.node(key+'_pk',pk,x-30,y-110,140,50,'oval',fs=18,underline=True)
        p.edge(key+'_pk',key,[(x+40,y-60),(x+70,y)])
        if attr:
            p.node(key+'_attr',attr,x+130,y-110,160,50,'oval',fs=18)
            p.edge(key+'_attr',key,[(x+210,y-60),(x+150,y)])
    def rel(key,title,x,y,a,b,pts1,pts2,m1='(0, N)',m2='(1, 1)'):
        p.node(key,title,x,y,180,90,'diamond',fs=18)
        p.edge(a,key,pts1);p.edge(key,b,pts2)
        for value,point,other in [(m1,pts1[0],pts1[1]),(m2,pts2[-1],pts2[-2])]:
            distance=math.dist(point,other);dx=(other[0]-point[0])/distance;dy=(other[1]-point[1])/distance
            p.label(value,point[0]+dx*40+(40 if dy else 0),point[1]+dy*40-(18 if dx else 0),17)
    rel('places','оформляет',470,190,'user','order',[(320,235),(470,235)],[(650,235),(740,235)])
    rel('contains','содержит',1110,190,'order','item',[(960,235),(1110,235)],[(1290,235),(1380,235)])
    rel('volume','выбран',1400,470,'bottle','item',[(1490,790),(1490,560)],[(1490,470),(1490,270)])
    rel('base','выбрана',760,470,'atm','item',[(850,790),(850,560)],[(940,515),(1310,515),(1310,300),(1430,300),(1430,270)])
    rel('compatible','совместима',470,780,'atm','accent',[(740,825),(650,825)],[(470,825),(320,825)],m2='(0, N)')
    rel('cat','объединяет',120,1030,'category','accent',[(210,1280),(210,1120)],[(210,1030),(210,860)])
    # Accent selected by an order item; outer corridor avoids all attribute ovals.
    rel('note','выбран',470,490,'accent','item',[(210,790),(210,535),(470,535)],[(650,535),(680,535),(680,30),(1740,30),(1740,235),(1600,235)])
    p.label('Концептуальная модель: 7 сущностей, 7 связей. Показаны основные понятия заказа и каталога.',850,1400,18)
    p.label('Пара (минимум, максимум) относится к ближайшей сущности. Подчёркнутый атрибут — ключ.',850,1430,18)
    return p.output('chen')


def usecase():
    p=Page('Варианты использования Fragrance',1500,1180)
    p.node('system','Fragrance',240,40,1020,1080,'frame')
    for key,title,x,y in [('guest','Гость',80,160),('buyer','Покупатель',80,620),('admin','Администратор',1350,510)]:p.node(key,title,x,y,60,100,'actor')
    cases=[('catalog','Просматривать каталог',360,130),('build','Собирать аромат\nи узнавать цену',360,270),('register','Регистрироваться\nи входить',360,410),('cart','Управлять корзиной',360,550),('checkout','Оформлять заказ',360,690),('history','Смотреть свои заказы,\nотменять и повторять',360,830),('profile','Изменять профиль',360,970),('manage','Управлять каталогом\nи совместимостью',860,410),('orders','Обрабатывать заказы',860,550),('stats','Смотреть статистику\nи выгружать CSV',860,690),('exchange','Импортировать\nи экспортировать JSON',860,830)]
    for key,title,x,y in cases:p.node(key,title,x,y,300,80,'oval',fs=18)
    for b in ['catalog','build','register']:p.edge('guest',b,[(140,200),(360,p.nodes[b]['y']+40)])
    for b in ['cart','checkout','history','profile']:p.edge('buyer',b,[(140,660),(360,p.nodes[b]['y']+40)])
    for b in ['manage','orders','stats','exchange']:p.edge('admin',b,[(1350,550),(1160,p.nodes[b]['y']+40)])
    p.edge('buyer','guest',[(80,650),(40,650),(40,210),(80,210)],kind='generalization')
    p.label('Покупатель наследует доступные гостю действия. Администратор показан в своей служебной роли.',750,1150,16)
    return p.output('usecase')


def algorithm():
    p=Page('Алгоритм оформления заказа',1500,1720)
    nodes=[('start','Начало',590,40,320,50,'terminal'),('auth','Сессия и CSRF\nдопустимы?',610,130,280,100,'diamond'),
    ('input','Контакты, ключ заказа\nи ревизия корректны?',610,290,280,110,'diamond'),('tx','Начать транзакцию;\nзаблокировать пользователя',550,460,400,70,'rect'),
    ('existing','Заказ с этим\nключом уже есть?',610,580,280,110,'diamond'),('cart','Загрузить корзину; проверить\nдоступность и совместимость;\nрассчитать цены по БД',540,750,420,90,'rect'),
    ('valid','Корзина непуста\nи доступна?',610,900,280,100,'diamond'),('revision','Ревизия\nсовпадает?',610,1060,280,100,'diamond'),
    ('write','Создать заказ, снимки позиций\nи первое событие истории;\nочистить корзину',540,1220,420,90,'rect'),('commit','COMMIT; освободить соединение;\nвернуть заказ',540,1380,420,70,'rect'),('end','Конец',590,1530,320,50,'terminal'),
    ('reject','Ответ 401 / 403 / 400',1100,220,340,60,'rect'),('reuse','Прочитать существующий заказ',1100,600,340,60,'rect'),('rollback','ROLLBACK; освободить\nсоединение; вернуть ошибку',70,1020,350,80,'rect')]
    for key,title,x,y,w,h,kind in nodes:p.node(key,title,x,y,w,h,kind,fs=17)
    chain=['start','auth','input','tx','existing','cart','valid','revision','write','commit','end']
    for a,b in zip(chain,chain[1:]):
        na,nb=p.nodes[a],p.nodes[b]
        p.edge(a,b,[(750,na['y']+na['h']),(750,nb['y'])],kind='arrow',label='Нет' if a=='existing' else 'Да' if a in ('auth','input','valid','revision') else '')
    p.edge('auth','reject',[(890,180),(1270,180),(1270,220)],kind='arrow',label='Нет')
    p.edge('input','reject',[(890,345),(1270,345),(1270,280)],kind='arrow',label='Нет')
    p.edge('existing','reuse',[(890,635),(1100,635)],kind='arrow',label='Да')
    p.edge('reuse','commit',[(1270,660),(1270,1415),(960,1415)],kind='arrow')
    p.edge('valid','rollback',[(610,950),(245,950),(245,1020)],kind='arrow',label='Нет: 422')
    p.edge('revision','rollback',[(610,1110),(460,1110),(460,1060),(420,1060)],kind='arrow',label='Нет: 409')
    p.edge('write','rollback',[(540,1265),(245,1265),(245,1100)],kind='arrow',label='Сбой записи')
    p.edge('rollback','end',[(70,1060),(40,1060),(40,1555),(590,1555)],kind='arrow')
    p.edge('reject','end',[(1440,250),(1470,250),(1470,1555),(910,1555)],kind='arrow')
    p.label('Любая ошибка внутри транзакции вызывает ROLLBACK; соединение освобождается в finally.',750,1640,17)
    p.label('409 требует обновить корзину и подтвердить её заново. Повтор ключа возвращает прежний заказ.',750,1670,17)
    return p.output('algorithm')


pages=[usecase(),chen(),algorithm(),database(False),database(True),classes()]
mx=E.Element('mxfile',host='app.diagrams.net')
for page in pages:mx.append(copy.deepcopy(page))
E.indent(mx);E.ElementTree(mx).write(OUT/'Fragrance-complete.drawio',encoding='utf-8',xml_declaration=True)
names=['usecase','chen','algorithm','logical','physical','classes-A3']
for index,name in enumerate(names):
    single=E.parse(OUT/(name+'.drawio')).getroot()[0]
    assert [(e.tag,dict(e.attrib)) for e in single.iter()]==[(e.tag,dict(e.attrib)) for e in mx[index].iter()]
with zipfile.ZipFile(OUT/'Fragrance-complete.zip','w',zipfile.ZIP_DEFLATED) as z:
    for f in sorted(OUT.iterdir()):
        if f.suffix in ('.drawio','.png','.md'):z.write(f,f.name)
with zipfile.ZipFile(OUT/'Fragrance-complete.zip') as z:
    for name in z.namelist():assert z.read(name)==(OUT/name).read_bytes()
print(f'OK: 6 sheets; 15 database tables; {len(fks)} foreign keys; XML, text widths, routes and ZIP verified.')
