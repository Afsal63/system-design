"use strict";
const NS = "http://www.w3.org/2000/svg";
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
function S(tag, attrs, parent){ const e=document.createElementNS(NS,tag); if(attrs) for(const k in attrs){ if(k==="text") e.textContent=attrs[k]; else e.setAttribute(k,attrs[k]); } if(parent) parent.appendChild(e); return e; }
function H(tag, attrs, ...kids){ const e=document.createElement(tag); if(attrs) for(const k in attrs){ if(attrs[k]==null) continue; if(k==="class") e.className=attrs[k]; else if(k==="html") e.innerHTML=attrs[k]; else if(k.startsWith("on")) e.addEventListener(k.slice(2),attrs[k]); else e.setAttribute(k,attrs[k]); } for(const c of kids){ if(c==null) continue; e.append(c.nodeType?c:String(c)); } return e; }
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const store = {
  get(k, d){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};
let learned = new Set(store.get("sda-learned", []));
let lessonsDone = new Set(store.get("sda-lessons", []));
function saveProgress(){ store.set("sda-learned",[...learned]); store.set("sda-lessons",[...lessonsDone]); renderProgress(); }

/* ======================= LESSON CONTENT ======================= */
// actions: ['s',from,to,label,kind('r' response | 'x' error)], ['m',node,state], ['n',node,text], ['cut',a,b], ['heal',a,b]
const LESSONS = [
{ id:"url", group:"The web", title:"What happens when you type a URL", mode:"map",
  blurb:"Follow one page load end to end: name lookup, connection setup, encryption, the request, and rendering.",
  nodes:[{id:"b",x:120,y:250,label:"Browser",kind:"client"},{id:"dns",x:400,y:90,label:"DNS resolver",kind:"dns"},{id:"srv",x:600,y:250,label:"Web server",kind:"server"},{id:"db",x:850,y:250,label:"Database",kind:"db"}],
  edges:[["b","dns"],["b","srv"],["srv","db"]],
  steps:[
    {say:"You type bytebytego.com and press Enter. The browser parses the URL into scheme (https), host (bytebytego.com) and path (/).", a:[["m","b","active"],["n","b","https://bytebytego.com/"]]},
    {say:"Computers connect by IP address, not by name. The browser checks its own cache and the OS cache, then asks a DNS resolver.", a:[["s","b","dns","A? bytebytego.com"]]},
    {say:"The resolver replies with the server's IP address. The DNS lesson shows how the resolver finds it.", a:[["s","dns","b","104.18.2.1","r"],["n","b","IP = 104.18.2.1"]]},
    {say:"The browser opens a TCP connection with a three-way handshake: SYN, SYN-ACK, ACK. This costs one round trip before any data moves.", a:[["s","b","srv","SYN"],["s","srv","b","SYN-ACK","r"],["s","b","srv","ACK"],["n","b","TCP connected"]]},
    {say:"Because the URL is https, a TLS handshake follows. The server proves its identity with a certificate and both sides agree on an encryption key.", a:[["s","b","srv","ClientHello"],["s","srv","b","ServerHello + cert","r"],["s","b","srv","key exchange"],["n","srv","TLS session ready"]]},
    {say:"Now the browser sends the actual HTTP request over the encrypted connection.", a:[["s","b","srv","GET / HTTP/2"],["m","srv","active"]]},
    {say:"The server runs application code, which often needs data from a database.", a:[["s","srv","db","SELECT * FROM posts"],["s","db","srv","42 rows","r"]]},
    {say:"The server responds with status 200 and the HTML. The browser then fetches CSS, JavaScript and images, often over the same connection.", a:[["m","srv",null],["s","srv","b","200 OK · text/html","r"]]},
    {say:"The browser parses HTML into the DOM and CSS into the CSSOM, combines them into a render tree, computes layout, and paints pixels on screen.", a:[["n","b","DOM → layout → paint"],["m","b","ok"]]}
  ],
  takeaways:["DNS turns a name into an IP address, with caching at every layer.","TCP and TLS handshakes cost round trips before the first byte arrives. That is why connection reuse, HTTP/2 and HTTP/3 matter.","The server may call databases and other services before it can answer.","Rendering is its own pipeline: DOM, CSSOM, render tree, layout, paint."],
  related:["what-happens-when-you-type-a-url-into-your-browser","how-does-the-browser-render-a-web-page","what-makes-http2-faster-than-http1","do-you-know-all-the-components-of-a-url"] },

{ id:"dns", group:"The web", title:"DNS lookup", mode:"seq",
  blurb:"How a resolver walks the DNS hierarchy, from root to TLD to the authoritative server, to turn a name into an IP address.",
  lanes:[{id:"b",label:"Browser"},{id:"r",label:"Resolver"},{id:"root",label:"Root server"},{id:"tld",label:".com TLD"},{id:"auth",label:"Authoritative NS"}],
  steps:[
    {say:"The browser and OS caches have no entry, so the browser asks a recursive resolver, usually your ISP's or a public one like 1.1.1.1.", a:[["m","b","active"],["s","b","r","where is bytebytego.com?"]]},
    {say:"The resolver hasn't cached it either, so it starts at the top of the hierarchy and asks a root server. There are 13 root server identities, each run on hundreds of machines worldwide.", a:[["s","r","root","bytebytego.com?"]]},
    {say:"The root doesn't know the IP, but it knows which servers handle .com, so it sends back a referral.", a:[["s","root","r","ask a.gtld-servers.net","r"]]},
    {say:"The resolver asks the .com TLD server, which points it to the domain's own name servers.", a:[["s","r","tld","bytebytego.com?"],["s","tld","r","ask ns1.cloudflare.com","r"]]},
    {say:"The authoritative name server holds the domain's actual records and answers with the A record and its TTL.", a:[["s","r","auth","A record?"],["s","auth","r","A 104.18.2.1  TTL 300","r"],["m","auth","ok"]]},
    {say:"The resolver caches the answer for the TTL (300 seconds) and returns it. Any lookup in the next 5 minutes skips the whole walk.", a:[["n","r","cached for 300 s"],["s","r","b","104.18.2.1","r"],["m","b","ok"]]}
  ],
  takeaways:["The browser makes one recursive query; the resolver does the iterative walk: root → TLD → authoritative.","Caching in the browser, OS and resolver makes most lookups instant.","TTL is a tradeoff: long TTLs cut lookups, short TTLs let you move traffic quickly.","Common records: A (IPv4), AAAA (IPv6), CNAME (alias), MX (mail), NS (delegation), TXT."],
  related:["how-does-the-domain-name-system-dns-lookup-work","dns-record-types-you-should-know","internet-traffic-routing-policies"] },

{ id:"realtime", group:"The web", title:"Polling, long polling, SSE, WebSocket", mode:"seq",
  blurb:"Four ways a client can get fresh data from a server. Switch between them to see the difference in round trips and latency.",
  lanes:[{id:"c",label:"Client"},{id:"s",label:"Server"}],
  variants:[
    {name:"Short polling", steps:[
      {say:"The client asks on a fixed timer, say every 2 seconds, whether anything changed.", a:[["s","c","s","GET /updates (t=0s)"],["s","s","c","200 · nothing new","r"]]},
      {say:"It asks again. Most of these requests come back empty, which wastes bandwidth and server work.", a:[["s","c","s","GET /updates (t=2s)"],["s","s","c","200 · nothing new","r"]]},
      {say:"A new message arrives on the server, but the client won't learn about it until its next poll.", a:[["n","s","new message arrives"],["m","s","warn"]]},
      {say:"The next poll picks it up. Delivery latency can be as long as a full polling interval.", a:[["s","c","s","GET /updates (t=4s)"],["s","s","c","200 · message #1","r"],["m","s",null],["m","c","ok"]]}
    ]},
    {name:"Long polling", steps:[
      {say:"The client sends a request, and the server holds it open until there is data or a timeout is reached.", a:[["s","c","s","GET /updates (wait)"],["n","s","holding request…"]]},
      {say:"As soon as a message arrives, the server answers the pending request, with almost no delay.", a:[["n","s","new message arrives"],["s","s","c","200 · message #1","r"],["m","c","ok"]]},
      {say:"The client immediately sends the next request so the server always has one waiting.", a:[["s","c","s","GET /updates (wait)"]]},
      {say:"If nothing arrives before the timeout (often around 30 s), the server answers empty and the client reconnects. Each message still costs a new HTTP request.", a:[["s","s","c","204 · timeout","r"],["s","c","s","GET /updates (wait)"]]}
    ]},
    {name:"Server-Sent Events", steps:[
      {say:"The client opens one HTTP request and asks for an event stream.", a:[["s","c","s","GET /prices  Accept: text/event-stream"]]},
      {say:"The server keeps the response open and writes an event whenever something happens. No new request is needed per message.", a:[["s","s","c","data: AAPL 189.20","r"],["s","s","c","data: AAPL 189.35","r"],["s","s","c","data: AAPL 188.90","r"]]},
      {say:"Traffic goes one way only, server to client. If the connection drops, the browser reconnects automatically and sends Last-Event-ID so it can resume.", a:[["n","c","auto-reconnect + Last-Event-ID"]]}
    ]},
    {name:"WebSocket", steps:[
      {say:"The connection starts as normal HTTP with an Upgrade header.", a:[["s","c","s","GET /chat  Upgrade: websocket"],["s","s","c","101 Switching Protocols","r"]]},
      {say:"It is now a persistent full-duplex connection, so either side can send frames at any time with very little overhead.", a:[["s","c","s","frame: \"hi team\""],["s","s","c","frame: \"Ana is typing…\"","r"],["s","s","c","frame: \"hello!\"","r"],["s","c","s","frame: \"👍\""]]},
      {say:"This suits chat, multiplayer games and collaborative editing. The cost is that every open connection is state the server must hold, which makes load balancing and scaling harder.", a:[["n","s","1 open socket per user"],["m","s","warn"]]}
    ]}
  ],
  takeaways:["Short polling is simple but wasteful, and its latency equals the polling interval.","Long polling gives near-instant delivery over plain HTTP but needs one request per message.","SSE streams from server to client over one HTTP response, with reconnection built in.","WebSocket is bidirectional and low-overhead, at the cost of long-lived stateful connections."],
  related:["shortlong-polling-sse-websocket","polling-vs-webhooks"] },

{ id:"cdn", group:"The web", title:"Content delivery network", mode:"map",
  blurb:"Edge servers near users cache static content, so most requests never travel to the origin.",
  nodes:[{id:"ue",x:100,y:90,label:"User",sub:"Paris",kind:"user"},{id:"uu",x:100,y:250,label:"User",sub:"New York",kind:"user"},{id:"ua",x:100,y:400,label:"User",sub:"Tokyo",kind:"user"},
         {id:"ee",x:440,y:90,label:"Edge",sub:"Frankfurt",kind:"cdn"},{id:"eu",x:440,y:250,label:"Edge",sub:"Virginia",kind:"cdn"},{id:"ea",x:440,y:400,label:"Edge",sub:"Singapore",kind:"cdn"},
         {id:"o",x:830,y:250,label:"Origin server",sub:"us-east-1",kind:"server"}],
  edges:[["ue","ee"],["uu","eu"],["ua","ea"],["ee","o"],["eu","o"],["ea","o"]],
  steps:[
    {say:"Without a CDN, everyone fetches from one origin. A round trip from Tokyo to Virginia takes about 180 ms, and a page needs dozens of them.", a:[["m","o","active"]]},
    {say:"With a CDN, DNS (GeoDNS or Anycast) sends each user to the nearest edge location.", par:true, a:[["s","ue","ee","GET /logo.png"],["s","uu","eu","GET /logo.png"],["s","ua","ea","GET /logo.png"]]},
    {say:"Frankfurt and Virginia already have the file cached, so they answer straight away (cache hits).", par:true, a:[["m","o",null],["s","ee","ue","HIT · 12 ms","r"],["s","eu","uu","HIT · 9 ms","r"],["m","ee","ok"],["m","eu","ok"]]},
    {say:"Singapore doesn't have it yet. On a cache miss, the edge fetches the file from the origin once.", a:[["m","ea","warn"],["s","ea","o","MISS → fetch logo.png"],["s","o","ea","logo.png","r"],["n","ea","cached · max-age=86400"]]},
    {say:"The edge returns the file to the user. This first request was slow, about 210 ms.", a:[["s","ea","ua","200 · 210 ms","r"]]},
    {say:"The next user in Tokyo gets a cache hit from Singapore in about 15 ms, without touching the origin.", a:[["s","ua","ea","GET /logo.png"],["m","ea","ok"],["s","ea","ua","HIT · 15 ms","r"]]},
    {say:"Content stays cached until its Cache-Control max-age expires or you purge it on deploy. The origin now handles a small fraction of the traffic.", a:[["n","o","load ↓ 95%"],["m","o","ok"]]}
  ],
  takeaways:["Latency is mostly distance; edges move content close to users.","Cache hit ratio is the key metric. Misses go to the origin.","Cache-Control headers and purges decide how fresh edge content is.","CDNs also absorb DDoS traffic and terminate TLS near the user."],
  related:["what-is-cdn-content-delivery-network","a-beginner's-guide-to-cdn-content-delivery-network","why-are-content-delivery-networks-cdn-so-popular"] },

{ id:"lb", group:"Scaling", title:"Load balancing algorithms", mode:"sim",
  blurb:"A live simulation. Requests from six clients flow through a load balancer to four servers. Change the algorithm, slow a server down, or take one offline.",
  takeaways:["Round robin is simple, but it ignores how busy each server actually is.","Least connections adapts to slow servers and uneven request costs.","Weighted algorithms suit servers with different capacity.","IP hash gives sticky sessions, but removing a server remaps many clients. Consistent hashing fixes that.","Health checks take failed servers out of rotation automatically."],
  related:["what-is-a-load-balancer","top-6-load-balancing-algorithms","key-use-cases-for-load-balancers","load-balancer-realistic-use-cases-you-may-not-know","reverse-proxy-vs-api-gateway-vs-load-balancer"] },

{ id:"cache", group:"Scaling", title:"Caching and eviction", mode:"sim",
  blurb:"Cache-aside with a four-slot cache in front of a database. Request keys yourself or turn on live traffic, and compare LRU, LFU and FIFO eviction.",
  takeaways:["Cache-aside: read the cache first; on a miss, read the database and fill the cache.","A hit costs about 1 ms and a miss about 40 ms, so the hit ratio dominates average latency.","LRU keeps recently used keys; LFU keeps frequently used keys; FIFO ignores usage.","On writes, update the database and then delete the cache key so the next read loads fresh data.","Risks: stampedes when hot keys expire, stale data, and penetration by keys that don't exist."],
  related:["top-5-caching-strategies","top-8-cache-eviction-strategies","cache-systems-every-developer-should-know","how-can-cache-systems-go-wrong","things-to-consider-when-using-cache","memcached-vs-redis"] },

{ id:"ring", group:"Scaling", title:"Consistent hashing", mode:"sim",
  blurb:"Servers and keys are placed on a hash ring, and each key belongs to the next server clockwise. Add or remove servers to see how few keys move.",
  takeaways:["With hash(key) % N, changing N remaps most keys, which empties caches and forces mass data movement.","On a ring, adding a server only takes keys from its clockwise neighbour, about 1/N of the keys.","Virtual nodes give each server many points on the ring, which evens out load.","Used by DynamoDB, Cassandra, Discord, CDNs and distributed caches."],
  related:["consistent-hashing","top-4-data-sharding-algorithms-explained","a-crash-course-in-database-sharding","key-concepts-to-understand-database-sharding"] },

{ id:"gateway", group:"Architecture", title:"API gateway and microservices", mode:"map",
  blurb:"One entry point authenticates, rate-limits and routes requests to independent services that each own their data.",
  nodes:[{id:"app",x:100,y:250,label:"Mobile app",kind:"client"},{id:"gw",x:340,y:250,label:"API gateway",kind:"gateway"},{id:"auth",x:340,y:80,label:"Auth service",kind:"service"},
         {id:"ord",x:610,y:250,label:"Order service",kind:"service"},{id:"pay",x:610,y:400,label:"Payment service",kind:"service"},{id:"usr",x:610,y:90,label:"User service",kind:"service"},
         {id:"odb",x:860,y:250,label:"Orders DB",kind:"db"},{id:"udb",x:860,y:90,label:"Users DB",kind:"db"}],
  edges:[["app","gw"],["gw","auth"],["gw","ord"],["gw","usr"],["ord","pay"],["ord","odb"],["usr","udb"]],
  steps:[
    {say:"The app sends every request to a single public entry point. It never needs to know where individual services live.", a:[["s","app","gw","GET /orders/42 + JWT"],["m","gw","active"]]},
    {say:"The gateway handles cross-cutting work first: it validates the token, applies the rate limit for this client, and checks the request.", a:[["s","gw","auth","verify token"],["s","auth","gw","valid · user 7","r"],["n","gw","rate limit 18/100 ok"]]},
    {say:"It routes by path. /orders goes to the Order service, whose address comes from service discovery.", a:[["s","gw","ord","GET /orders/42"],["m","ord","active"]]},
    {say:"Each service owns its database. Other services never read the orders table directly; they go through the Order API.", a:[["s","ord","odb","SELECT order 42"],["s","odb","ord","row","r"]]},
    {say:"Services call each other over the network using REST, gRPC or events. Here the Order service asks the Payment service for the payment status.", a:[["s","ord","pay","status of 42?"],["s","pay","ord","PAID","r"]]},
    {say:"The response travels back. The gateway can also aggregate calls, transform formats, cache, and log metrics.", a:[["m","ord",null],["s","ord","gw","order JSON","r"],["s","gw","app","200 · order 42","r"],["m","app","ok"]]},
    {say:"Failure isolation: Payment becomes slow, so a circuit breaker in the Order service stops calling it and returns a fallback. One slow service doesn't take the whole system down.", a:[["m","pay","bad"],["s","ord","pay","status?","x"],["n","ord","breaker OPEN → fallback"],["m","ord","warn"]]}
  ],
  takeaways:["The gateway centralizes auth, rate limiting, routing, TLS and observability.","Each microservice deploys independently and owns its data.","Network calls between services fail, so use timeouts, retries and circuit breakers.","Microservices trade simplicity for team independence. A monolith is often the right start."],
  related:["api-gateway-101","what-does-api-gateway-do","top-3-api-gateway-use-cases","what-does-a-typical-microservice-architecture-look-like","9-best-practices-for-building-microservices","is-microservice-architecture-the-silver-bullet"] },

{ id:"kafka", group:"Architecture", title:"Kafka: partitions and consumer groups", mode:"map",
  blurb:"How producers, partitioned logs, offsets and consumer groups let Kafka scale and replay events.",
  nodes:[{id:"p1",x:100,y:130,label:"Producer",sub:"checkout",kind:"service"},{id:"p2",x:100,y:370,label:"Producer",sub:"web",kind:"service"},
         {id:"t0",x:460,y:90,label:"orders · P0",kind:"queue"},{id:"t1",x:460,y:250,label:"orders · P1",kind:"queue"},{id:"t2",x:460,y:400,label:"orders · P2",kind:"queue"},
         {id:"c1",x:840,y:150,label:"Consumer A1",kind:"service"},{id:"c2",x:840,y:370,label:"Consumer A2",kind:"service"}],
  edges:[["p1","t0"],["p1","t1"],["p2","t1"],["p2","t2"],["t0","c1"],["t1","c1"],["t2","c2"],["t2","c1"]],
  steps:[
    {say:"Producers write events to a topic called orders. The topic is split into partitions so it can spread across brokers and scale.", a:[["s","p1","t0","order#1  key=u7"]]},
    {say:"The record key is hashed to choose a partition. Every event for user u7 lands in P0, so they stay in order.", a:[["s","p1","t0","order#2  key=u7"],["n","t0","offsets 0,1"]]},
    {say:"Events with other keys spread across the other partitions.", par:true, a:[["s","p2","t1","order#3  key=u2"],["s","p2","t2","order#4  key=u9"],["n","t1","offset 0"],["n","t2","offset 0"]]},
    {say:"Each partition is an append-only log on disk. Sequential writes and zero-copy reads are why Kafka is fast.", a:[["m","t0","active"],["m","t1","active"],["m","t2","active"]]},
    {say:"Consumer group A splits the partitions: A1 reads P0 and P1, A2 reads P2. Within a group, each partition goes to exactly one consumer.", par:true, a:[["m","t0",null],["m","t1",null],["m","t2",null],["s","t0","c1","order#1"],["s","t1","c1","order#3"],["s","t2","c2","order#4"]]},
    {say:"After processing, consumers commit their offsets. After a restart they resume from the last commit, which gives at-least-once delivery.", a:[["n","c1","commit P0@1, P1@0"],["n","c2","commit P2@0"]]},
    {say:"Consumer A2 crashes. The group rebalances and A1 takes over P2, starting from A2's last committed offset.", a:[["m","c2","bad"],["n","c2","crashed"],["s","t2","c1","order#5 (rebalanced)"],["m","c1","ok"]]},
    {say:"Events stay on disk for the retention period, for example 7 days. A new consumer group, such as analytics, can replay the topic from offset 0 without affecting group A.", a:[["n","t0","retained 7 days"]]}
  ],
  takeaways:["A topic is split into partitions; ordering is guaranteed only within a partition.","The key decides the partition, so related events stay ordered.","Consumer groups divide partitions among consumers; extra consumers beyond the partition count sit idle.","Offsets plus retention give replay, at-least-once delivery and decoupled consumers."],
  related:["the-ultimate-kafka-101-you-cannot-miss","why-is-kafka-fast","can-kafka-lose-messages","top-5-kafka-use-cases","types-of-message-queue","how-do-message-queue-architectures-evolve"] },

{ id:"replica", group:"Data", title:"Replication and read replicas", mode:"map",
  blurb:"Writes go to a primary and stream to replicas that serve reads. Watch replication lag cause a stale read, then see a failover.",
  nodes:[{id:"app",x:120,y:250,label:"App server",kind:"server"},{id:"pr",x:460,y:250,label:"Primary DB",kind:"db"},{id:"r1",x:820,y:110,label:"Replica 1",kind:"db"},{id:"r2",x:820,y:390,label:"Replica 2",kind:"db"}],
  edges:[["app","pr"],["pr","r1"],["pr","r2"],["app","r1"],["app","r2"]],
  steps:[
    {say:"All writes go to the primary database.", a:[["s","app","pr","UPDATE user SET name='Ann'"],["n","pr","name=Ann"]]},
    {say:"The primary records the change in its log (binlog or WAL) and streams it to the replicas asynchronously.", par:true, a:[["s","pr","r1","log #812"],["s","pr","r2","log #812"],["n","r1","name=Ann"],["n","r2","name=Ann"]]},
    {say:"Reads are spread across the replicas, so you can add read capacity by adding replicas. Most apps read far more than they write.", par:true, a:[["s","app","r1","SELECT name"],["s","app","r2","SELECT name"]]},
    {say:"A new write arrives. Replica 1 applies it quickly, but Replica 2 is busy and falls 2 seconds behind. That delay is replication lag.", a:[["s","app","pr","UPDATE name='Bo'"],["n","pr","name=Bo"],["s","pr","r1","log #813"],["n","r1","name=Bo"],["n","r2","lag 2 s · name=Ann"],["m","r2","warn"]]},
    {say:"The user who just renamed themselves reloads, the read lands on Replica 2, and they see the old name. A common fix is read-your-own-writes: send that user's reads to the primary for a few seconds.", a:[["s","app","r2","SELECT name"],["s","r2","app","'Ann' (stale!)","x"]]},
    {say:"The primary fails. The most up-to-date replica is promoted to primary, and the app sends writes there. Any writes that hadn't replicated yet can be lost.", a:[["m","r2",null],["m","pr","bad"],["n","pr","down"],["m","r1","ok"],["n","r1","promoted → primary"],["s","app","r1","writes go here now"]]}
  ],
  takeaways:["Leader-follower replication scales reads, not writes. Sharding scales writes.","Asynchronous replication is fast but has lag, so reads can be stale.","Synchronous or semi-synchronous replication trades write latency for durability.","Failover needs detection, promotion and client rerouting, and unreplicated writes can be lost."],
  related:["read-replica-pattern","how-to-implement-read-replica-pattern","7-must-know-strategies-to-scale-your-database"] },

{ id:"cap", group:"Data", title:"CAP theorem in action", mode:"map",
  blurb:"During a network partition, a distributed store must choose between returning correct data and returning any data.",
  nodes:[{id:"c1",x:100,y:250,label:"Client 1",kind:"client"},{id:"a",x:360,y:250,label:"Node A",kind:"db"},{id:"b",x:600,y:250,label:"Node B",kind:"db"},{id:"c2",x:860,y:250,label:"Client 2",kind:"client"}],
  edges:[["c1","a"],["a","b"],["b","c2"]],
  steps:[
    {say:"Two nodes hold copies of the same value, x = 1, and keep each other in sync over the network.", a:[["n","a","x = 1"],["n","b","x = 1"]]},
    {say:"Normal operation: Client 1 writes x = 2 to Node A, and A replicates it to B.", a:[["s","c1","a","SET x = 2"],["n","a","x = 2"],["s","a","b","replicate x = 2"],["n","b","x = 2"]]},
    {say:"A network partition: A and B can no longer reach each other. In a distributed system partitions will happen, so the real choice is what to do when they do.", a:[["cut","a","b"]]},
    {say:"Client 1 writes x = 3 to Node A. A cannot replicate it.", a:[["s","c1","a","SET x = 3"],["n","a","x = 3"],["s","a","b","replicate x = 3","x"]]},
    {say:"Option CP (consistency): Node B refuses to answer because it can't be sure its data is current. The answer is never wrong, but the system is unavailable. Examples: ZooKeeper, etcd, HBase.", a:[["s","c2","b","GET x"],["s","b","c2","error: unavailable","x"],["m","b","bad"]]},
    {say:"Option AP (availability): Node B answers with what it has. The system stays up, but the answer is stale. Examples: Cassandra, DynamoDB with eventual consistency.", a:[["m","b",null],["s","c2","b","GET x"],["s","b","c2","x = 2 (stale)","r"],["m","b","warn"]]},
    {say:"The partition heals. AP systems reconcile diverged copies using last-write-wins, vector clocks or CRDTs, and the nodes converge.", a:[["heal","a","b"],["s","a","b","sync x = 3"],["n","b","x = 3"],["m","b","ok"],["m","a","ok"]]}
  ],
  takeaways:["C in CAP means every read sees the latest write (linearizability). It is not the C in ACID.","Without a partition you can have both C and A; the choice only arises during a partition.","CP systems refuse requests during a partition; AP systems serve possibly stale data.","PACELC adds that even with no partition, you trade latency against consistency."],
  related:["cap-theorem-one-of-the-most-misunderstood-terms","cap-base-solid-kiss-what-do-these-acronyms-mean"] },

{ id:"https", group:"Security", title:"How HTTPS works", mode:"seq",
  blurb:"TCP handshake, certificate check, key exchange, then fast symmetric encryption for every request.",
  lanes:[{id:"c",label:"Browser"},{id:"s",label:"Server"}],
  steps:[
    {say:"First a TCP connection is established with SYN, SYN-ACK, ACK.", a:[["s","c","s","SYN"],["s","s","c","SYN-ACK","r"],["s","c","s","ACK"]]},
    {say:"Client Hello: the browser lists the TLS versions and cipher suites it supports, plus a random value.", a:[["s","c","s","Client Hello · TLS 1.3, ciphers"]]},
    {say:"Server Hello: the server picks a cipher suite and sends its certificate. The certificate contains the server's public key and is signed by a certificate authority (CA).", a:[["s","s","c","Server Hello + certificate","r"]]},
    {say:"The browser verifies the certificate chain against CAs it already trusts and checks the domain name and expiry date. This stops someone from impersonating the server.", a:[["n","c","certificate valid ✓"],["m","c","ok"]]},
    {say:"The client creates a session key and sends it encrypted with the server's public key. Only the server's private key can decrypt it. TLS 1.3 uses a Diffie-Hellman exchange instead, so the key itself is never sent.", a:[["m","c",null],["s","c","s","encrypted session key"],["n","s","decrypt with private key"]]},
    {say:"Both sides now share the same symmetric key. Asymmetric cryptography was used only to agree on it, because symmetric encryption is far faster for bulk data.", a:[["m","c","ok"],["m","s","ok"]]},
    {say:"Every request and response is now encrypted. Anyone in between sees only ciphertext.", a:[["s","c","s","GET /account  [encrypted]"],["s","s","c","200 OK  [encrypted]","r"]]}
  ],
  takeaways:["The certificate proves the server's identity; a CA signature makes it trustworthy.","Asymmetric crypto is used for key exchange, symmetric crypto for the data.","TLS 1.3 needs one round trip (or zero on resumption) and gives forward secrecy.","HTTPS protects data in transit, not data stored on the server."],
  related:["how-does-https-work","https-ssl-handshake-and-data-encryption-explained-to-kids","is-https-safe","how-digital-signatures-work"] },

{ id:"oauth", group:"Security", title:"OAuth 2.0 authorization code flow", mode:"seq",
  blurb:"How \"Sign in with Google\" lets an app access your data without ever seeing your password.",
  lanes:[{id:"u",label:"You (browser)"},{id:"app",label:"Photo app"},{id:"as",label:"Google auth server"},{id:"api",label:"Google Photos API"}],
  steps:[
    {say:"You click Sign in with Google in a photo-printing app.", a:[["s","u","app","click Sign in with Google"]]},
    {say:"The app redirects your browser to Google's authorization server with its client_id, the scope it wants (read photos) and a redirect URI.", a:[["s","app","u","302 → accounts.google.com?scope=photos.read","r"],["s","u","as","open login + consent page"]]},
    {say:"You log in at Google, so the app never sees your password, and approve the requested scope.", a:[["n","as","user approves photos.read"],["m","as","active"]]},
    {say:"Google redirects back to the app with a short-lived, single-use authorization code.", a:[["m","as",null],["s","as","u","302 → app/callback?code=xyz","r"],["s","u","app","code=xyz"]]},
    {say:"The app's backend exchanges the code plus its client secret for tokens, server to server. The tokens never pass through the browser.", a:[["s","app","as","code + client_secret"],["s","as","app","access_token + refresh_token","r"],["m","app","ok"]]},
    {say:"The app calls the API with the access token. The API allows only what the scope permits, here reading photos.", a:[["s","app","api","GET /photos  Bearer eyJ…"],["s","api","app","your photos","r"]]},
    {say:"When the access token expires, often after an hour, the app uses the refresh token to get a new one without asking you again.", a:[["s","app","as","refresh_token"],["s","as","app","new access_token","r"]]}
  ],
  takeaways:["OAuth is for delegated authorization; OpenID Connect adds identity (an ID token) on top.","The app never sees your password and gets only the scopes you approved.","The code is exchanged on the back channel so tokens stay out of the browser. Public clients add PKCE.","Short-lived access tokens limit damage if one leaks; refresh tokens renew them."],
  related:["oauth-2-explained-with-siple-terms","oauth-20-flows","session-cookie-jwt-token-sso-and-oauth-2","jwt-101-key-to-stateless-authentication","explaining-sessions-tokens-jwt-sso-and-oauth-in-one-diagram"] },

{ id:"cicd", group:"Delivery", title:"CI/CD pipeline", mode:"map",
  blurb:"From git push to production: build, test, package, stage, canary release, and rollback.",
  nodes:[{id:"dev",x:90,y:250,label:"Developer",kind:"user"},{id:"git",x:280,y:250,label:"Git repo",kind:"repo"},{id:"ci",x:470,y:250,label:"CI runner",kind:"ci"},
         {id:"reg",x:660,y:90,label:"Registry",sub:"images",kind:"repo"},{id:"stg",x:660,y:400,label:"Staging",kind:"server"},{id:"prod",x:870,y:250,label:"Production",kind:"server"}],
  edges:[["dev","git"],["git","ci"],["ci","reg"],["reg","stg"],["reg","prod"]],
  steps:[
    {say:"A developer pushes a commit and opens a pull request.", a:[["s","dev","git","git push feature/cart"]]},
    {say:"The push triggers the pipeline through a webhook.", a:[["s","git","ci","webhook: run pipeline"],["m","ci","active"]]},
    {say:"Continuous integration builds the code and runs unit tests, linters and security scans. Any failure blocks the merge.", a:[["n","ci","build ✓ tests ✓ lint ✓ scan ✓"],["m","ci","ok"]]},
    {say:"The build produces an immutable, versioned artifact, such as a Docker image, and pushes it to a registry.", a:[["s","ci","reg","app:1.4.2"],["n","reg","app:1.4.2"]]},
    {say:"Continuous delivery deploys that exact image to staging for integration and end-to-end tests.", a:[["s","reg","stg","deploy 1.4.2"],["n","stg","e2e tests ✓"],["m","stg","ok"]]},
    {say:"Production rollout uses a canary: about 5% of traffic goes to the new version while error rate and latency are watched, then traffic increases step by step.", a:[["s","reg","prod","canary 1.4.2"],["n","prod","5% → 25% → 100%"],["m","prod","active"]]},
    {say:"Metrics get worse, so the deploy is rolled back to the previous image. Rollback is quick and safe because artifacts are immutable.", a:[["m","prod","warn"],["s","reg","prod","rollback → 1.4.1","x"],["n","prod","running 1.4.1"]]}
  ],
  takeaways:["CI merges and tests small changes often; CD keeps every build releasable.","Build once and promote the same artifact through every environment.","Release strategies include rolling, blue-green, canary and feature flags.","Automated rollback and good monitoring make frequent deploys safe."],
  related:["cicd-pipeline-explained-in-simple-terms","cicd-simplified-visual-guide","top-5-most-used-deployment-strategies","kubernetes-deployment-strategies","how-to-deploy-services"] }
];
LESSONS.push(...(window.EXTRA_LESSONS||[]));
const LESSON_MAP = Object.fromEntries(LESSONS.map(l=>[l.id,l]));
const CAT_LESSONS = {"api-web-development":["url","realtime","gateway"],"cloud-distributed-systems":["cap","ring","lb","replica"],"database-and-storage":["replica","cap","ring"],"caching-performance":["cache","cdn"],"security":["https","oauth"],"devops-cicd":["cicd"],"software-architecture":["gateway","kafka"],"how-it-works":["url","dns"],"computer-fundamentals":["url"]};
for(const [c,ids] of Object.entries(window.EXTRA_CAT_LESSONS||{})) CAT_LESSONS[c]=[...new Set([...(CAT_LESSONS[c]||[]),...ids])];
const LESSON_BY_GUIDE = {}; LESSONS.forEach(l=>l.related.forEach(g=>{ (LESSON_BY_GUIDE[g] ||= []).push(l.id); }));

/* ======================= STAGE ENGINE ======================= */
const svg = document.getElementById("stage"), stageWrap = document.getElementById("stageWrap");
const Stage = { run:0, speed:1 };
const ease = p => p<.5 ? 2*p*p : 1-Math.pow(-2*p+2,2)/2;
const D = ms => reduced ? 0 : ms/Stage.speed;
function tween(ms, fn, alive){ return new Promise(res=>{ if(ms<=0){ fn(1); res(); return; } const t0=performance.now(); const f=t=>{ if(!alive()){ res(); return; } const p=Math.min(1,(t-t0)/ms); fn(ease(p)); if(p<1) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); }
const sleep = ms => new Promise(r=>setTimeout(r, ms));
const NW=140, NH=60;
const KIND = {client:"CLIENT",user:"USER",dns:"DNS",server:"SERVER",db:"DATABASE",cdn:"CDN EDGE",gateway:"GATEWAY",service:"SERVICE",queue:"PARTITION",repo:"REPO",ci:"PIPELINE",cache:"CACHE",lb:"LOAD BALANCER",worker:"WORKER",router:"ROUTER",pool:"POOLER"};
function icon(kind, g){
  const x=NW/2-22, y=-NH/2+9;
  if(kind==="db"||kind==="queue"){ S("ellipse",{cx:x+7,cy:y+2,rx:7,ry:2.6,class:"ico"},g); S("path",{d:`M${x} ${y+2}v9c0 1.5 3 2.6 7 2.6s7-1.1 7-2.6v-9`,class:"ico"},g); }
  else if(kind==="user"||kind==="client"){ S("circle",{cx:x+7,cy:y+3,r:3,class:"ico"},g); S("path",{d:`M${x+1} ${y+13}c0-4 3-6 6-6s6 2 6 6`,class:"ico"},g); }
  else { S("rect",{x:x,y:y-1,width:14,height:6,rx:1.5,class:"ico"},g); S("rect",{x:x,y:y+7,width:14,height:6,rx:1.5,class:"ico"},g); }
}
function pill(parent, x, y, text, cls){
  const g=S("g",{class:cls||"note"},parent); const r=S("rect",{rx:6},g); const t=S("text",{x:x,y:y,"text-anchor":"middle",text:text},g);
  const b=t.getBBox(); r.setAttribute("x",b.x-7); r.setAttribute("y",b.y-4); r.setAttribute("width",b.width+14); r.setAttribute("height",b.height+8); return g;
}
function drawNode(n, mark, note, parent){
  const g=S("g",{class:"node"+(mark?" "+mark:""),transform:`translate(${n.x},${n.y})`},parent);
  S("rect",{x:-NW/2,y:-NH/2,width:NW,height:NH,rx:10,class:"box"},g);
  S("text",{x:-NW/2+11,y:-NH/2+16,class:"tag",text:KIND[n.kind]||""},g);
  icon(n.kind,g);
  S("text",{x:0,y:n.sub?9:13,"text-anchor":"middle",class:"lbl",text:n.label},g);
  if(n.sub) S("text",{x:0,y:24,"text-anchor":"middle",class:"sub",text:n.sub},g);
  if(note) pill(g,0,NH/2+20,note,"note");
}
const ekey=(a,b)=>[a,b].sort().join("|");
const P = { L:null, vi:0, i:0, playing:false };
function curSteps(){ return P.L.variants ? P.L.variants[P.vi].steps : P.L.steps; }
function applyStatic(st,a,j){
  switch(a[0]){
    case "s": st.rows.push({t:"msg",from:a[1],to:a[2],label:a[3],kind:a[4],step:j}); break;
    case "m": st.marks[a[1]]=a[2]; break;
    case "n": st.notes[a[1]]=a[2]; st.rows.push({t:"note",lane:a[1],text:a[2],step:j}); break;
    case "cut": st.cuts.add(ekey(a[1],a[2])); break;
    case "heal": st.cuts.delete(ekey(a[1],a[2])); break;
  }
}
function stateUpTo(k){ const st={marks:{},notes:{},cuts:new Set(),rows:[]}; const steps=curSteps(); for(let j=0;j<k;j++) for(const a of steps[j].a) applyStatic(st,a,j); return st; }

/* ---- map mode ---- */
let layer = {};
function drawMap(st){
  const L=P.L; svg.setAttribute("viewBox","0 0 960 470"); svg.innerHTML="";
  const gE=S("g",{},svg), gN=S("g",{},svg), gP=S("g",{},svg); layer={gN,gP};
  const N=Object.fromEntries(L.nodes.map(n=>[n.id,n]));
  for(const [a,b] of L.edges){ const A=N[a],B=N[b], cut=st.cuts.has(ekey(a,b));
    S("line",{x1:A.x,y1:A.y,x2:B.x,y2:B.y,class:"edge"+(cut?" cut":"")},gE);
    if(cut) S("text",{x:(A.x+B.x)/2,y:(A.y+B.y)/2-12,"text-anchor":"middle",class:"cutx",text:"✕ network partition"},gE); }
  for(const n of L.nodes) drawNode(n, st.marks[n.id], st.notes[n.id], gN);
}
async function mapPacket(from,to,label,kind,alive){
  const N=Object.fromEntries(P.L.nodes.map(n=>[n.id,n])); const A=N[from],B=N[to];
  const g=S("g",{class:"pkt"+(kind?" "+kind:"")},layer.gP);
  S("circle",{r:7},g); pill(g,0,-18,label,"");
  g.setAttribute("transform",`translate(${A.x},${A.y})`);
  await tween(D(1200), p=>g.setAttribute("transform",`translate(${A.x+(B.x-A.x)*p},${A.y+(B.y-A.y)*p})`), alive);
  await tween(D(260), p=>g.style.opacity=1-p, alive); g.remove();
}

/* ---- sequence mode ---- */
const ROW=50, TOP=96;
function laneX(id){ const lanes=P.L.lanes; const i=lanes.findIndex(l=>l.id===id); const pad=lanes.length>2?110:220; return pad + i*((960-2*pad)/Math.max(1,lanes.length-1)); }
function drawSeq(st, totalRows){
  const Hh=Math.max(420, TOP+totalRows*ROW+30); svg.setAttribute("viewBox",`0 0 960 ${Hh}`); svg.innerHTML="";
  const gL=S("g",{},svg), gR=S("g",{},svg); layer={gR};
  for(const l of P.L.lanes){ const x=laneX(l.id);
    S("line",{x1:x,y1:62,x2:x,y2:Hh-10,class:"lifeline"},gL);
    const g=S("g",{class:"lane-head"+(st.marks[l.id]?" "+st.marks[l.id]:"")},gL);
    S("rect",{x:x-78,y:16,width:156,height:44,rx:9,class:"box"},g); S("text",{x:x,y:43,"text-anchor":"middle",text:l.label},g); }
  st.rows.forEach((r,i)=>drawRow(r,i,1,false));
}
function drawRow(r, i, p, isNew){
  const y=TOP+i*ROW, g=S("g",{class:(r.t==="msg"?"msg"+(r.kind?" "+r.kind:""):"note")+(isNew?" rownew":"")},layer.gR);
  if(r.t==="note"){ pill(g,laneX(r.lane),y+4,r.text,"note"); return g; }
  const x1=laneX(r.from), x2=laneX(r.to), dir=Math.sign(x2-x1), a=x1+dir*6, b=x2-dir*8;
  S("text",{x:22,y:y+4,class:"stepnum",text:String(r.step+1).padStart(2,"0")},g);
  const line=S("line",{x1:a,y1:y,x2:a+(b-a)*p,y2:y},g);
  const head=S("polygon",{points:`${b},${y-5} ${b+dir*9},${y} ${b},${y+5}`,opacity:p>=1?1:0},g);
  const lg=S("g",{},g); const bg=S("rect",{class:"lbg",rx:4},lg); const t=S("text",{x:(x1+x2)/2,y:y-9,"text-anchor":"middle",text:r.label},lg);
  const bb=t.getBBox(); bg.setAttribute("x",bb.x-5); bg.setAttribute("y",bb.y-1); bg.setAttribute("width",bb.width+10); bg.setAttribute("height",bb.height+2);
  g._grow = q=>{ line.setAttribute("x2",a+(b-a)*q); head.setAttribute("opacity",q>=1?1:0); };
  return g;
}
function scrollToRow(i){ const sc=(svg.getBoundingClientRect().width||960)/960; const y=(TOP+i*ROW)*sc; if(y>stageWrap.scrollTop+stageWrap.clientHeight-60*sc || y<stageWrap.scrollTop) stageWrap.scrollTo({top:Math.max(0,y-stageWrap.clientHeight+90*sc),behavior:reduced?"auto":"smooth"}); }

function render(st, totalRows){ if(P.L.mode==="seq") drawSeq(st,totalRows); else drawMap(st); }

async function playStep(k, animate){
  const token=++Stage.run, alive=()=>token===Stage.run;
  const steps=curSteps(); P.i=k; updateControls();
  const st=stateUpTo(k), total=stateUpTo(k+1).rows.length;
  render(st,total);
  if(!animate){ for(const a of steps[k].a) applyStatic(st,a,k); render(st,total); if(P.L.mode==="seq") scrollToRow(st.rows.length-1); return; }
  const step=steps[k];
  if(step.par && P.L.mode==="map"){
    const sends=step.a.filter(a=>a[0]==="s");
    await Promise.all(sends.map(a=>P.L.mode==="seq"? seqAnim(st,a,k,alive) : mapPacket(a[1],a[2],a[3],a[4],alive)));
    if(!alive()) return;
    for(const a of step.a) if(a[0]!=="s"||P.L.mode==="map") applyStatic(st,a,k);
    render(st,total);
  } else {
    for(const a of step.a){
      if(!alive()) return;
      if(a[0]==="s"){ if(P.L.mode==="seq") await seqAnim(st,a,k,alive); else await mapPacket(a[1],a[2],a[3],a[4],alive); if(P.L.mode==="map") applyStatic(st,a,k); }
      else { applyStatic(st,a,k); render(st,total); if(P.L.mode==="seq"){ markNew(st.rows.length-1, a[0]==="n"); scrollToRow(st.rows.length-1); } await sleep(D(350)); }
    }
  }
  if(!alive()) return;
  if(k===steps.length-1){ lessonsDone.add(P.L.id); saveProgress(); renderLessonList(); }
  if(P.playing){
    await sleep(Math.max(1400, steps[k].say.length*32)/Stage.speed);
    if(!alive()||!P.playing) return;
    if(k<steps.length-1) playStep(k+1,true); else { P.playing=false; updateControls(); }
  }
}
function markNew(i, isNote){ if(!isNote) return; const g=layer.gR && layer.gR.children[i]; if(g) g.classList.add("rownew"); }
async function seqAnim(st,a,k,alive){
  const r={t:"msg",from:a[1],to:a[2],label:a[3],kind:a[4],step:k}; const i=st.rows.length;
  const g=drawRow(r,i,0,true); scrollToRow(i);
  await tween(D(900), q=>g._grow(q), alive);
  st.rows.push(r); setTimeout(()=>g.classList.remove("rownew"), D(900));
}

/* ======================= LESSON UI ======================= */
const $ = id => document.getElementById(id);
function renderLessonList(){
  const groups=[...new Set(LESSONS.map(l=>l.group))]; const box=$("lessonList"); box.innerHTML="";
  let n=0;
  for(const gname of groups){ const sec=H("div",{class:"ll-group"},H("h3",null,gname)); const inner=H("div");
    for(const l of LESSONS.filter(l=>l.group===gname)){ n++;
      inner.append(H("a",{href:"#lab-"+l.id,"aria-current":P.L&&P.L.id===l.id?"page":"false"},H("span",{class:"k"},String(n).padStart(2,"0")),l.title,lessonsDone.has(l.id)?H("span",{class:"done",title:"Completed"},"✓"):null)); }
    sec.append(inner); box.append(sec); }
}
function updateControls(){
  const L=P.L; const sim=L.mode==="sim";
  $("controls").hidden=sim; $("narr").hidden=sim; $("simPanel").hidden=!sim;
  if(sim) return;
  const steps=curSteps();
  $("stepNo").textContent=`Step ${P.i+1} / ${steps.length}`;
  $("stepText").textContent=steps[P.i].say;
  $("bPlay").textContent = P.playing ? "❚❚ Pause" : (P.i===steps.length-1 && !P.playing ? "▶ Replay" : "▶ Play");
  $("bBack").disabled = P.i===0; $("bNext").disabled = P.i===steps.length-1;
  const dots=$("dots"); dots.innerHTML="";
  steps.forEach((s,j)=>dots.append(H("button",{class:j<P.i?"past":j===P.i?"cur":"",title:`Step ${j+1}`,"aria-label":`Go to step ${j+1}`,onclick:()=>{ P.playing=false; playStep(j,true); }})));
}
let activeSim=null;
function stopAll(){ Stage.run++; P.playing=false; if(activeSim){ activeSim.stop(); activeSim=null; } }
function showLesson(id){
  const L=LESSON_MAP[id]||LESSONS[0]; const changed=P.L!==L;
  stopAll(); P.L=L; if(changed) P.vi=0; P.i=0;
  $("lGroup").textContent=L.group+" · Lesson "+(LESSONS.indexOf(L)+1)+" of "+LESSONS.length;
  $("lTitle").textContent=L.title; $("lBlurb").textContent=L.blurb;
  const vt=$("variants"); vt.innerHTML="";
  if(L.variants) L.variants.forEach((v,i)=>vt.append(H("button",{"aria-pressed":String(i===P.vi),onclick:()=>{ stopAll(); P.vi=i; [...vt.children].forEach((b,j)=>b.setAttribute("aria-pressed",String(j===i))); stageWrap.scrollTop=0; P.playing=true; updateControls(); playStep(0,true); }},v.name)));
  $("takeaways").innerHTML=L.takeaways.map(t=>`<li>${esc(t)}</li>`).join("");
  renderRelated();
  renderLessonList();
  stageWrap.scrollTop=0;
  if(L.mode==="sim"){ updateControls(); activeSim = SIMS[L.id](); }
  else { playStep(0,false); updateControls(); }
  document.title="System Design Atlas";
}
function renderRelated(){
  const L=P.L, box=$("related"); if(!L) return;
  box.innerHTML="";
  for(const gid of L.related){ const g=DATA&&GUIDE[gid];
    box.append(H("a",{href:"#g-"+safe(gid)}, g?g.title:gid.replace(/-/g," "), g&&g.description?H("small",null,g.description):null)); }
}
$("bPlay").onclick=()=>{ const n=curSteps().length; if(P.playing){ P.playing=false; Stage.run++; updateControls(); playStep(P.i,false); return; } P.playing=true; if(P.i===n-1){ stageWrap.scrollTop=0; playStep(0,true);} else playStep(P.i,true); updateControls(); };
$("bNext").onclick=()=>{ P.playing=false; if(P.i<curSteps().length-1) playStep(P.i+1,true); };
$("bBack").onclick=()=>{ P.playing=false; if(P.i>0) playStep(P.i-1,true); };
$("bRestart").onclick=()=>{ P.playing=false; stageWrap.scrollTop=0; playStep(0,true); };
$("speed").onchange=e=>{ Stage.speed=+e.target.value; };
document.addEventListener("keydown",e=>{ if($("viewLab").hidden||P.L.mode==="sim"||/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if(e.key==="ArrowRight"){ $("bNext").click(); } else if(e.key==="ArrowLeft"){ $("bBack").click(); } else if(e.key===" "){ e.preventDefault(); $("bPlay").click(); } });

/* ======================= SIMULATIONS ======================= */
function fly(parent, A, B, cls, label, ms, alive){
  const g=S("g",{class:"pkt "+(cls||"")},parent); S("circle",{r:6},g); if(label) pill(g,0,-16,label,"");
  g.setAttribute("transform",`translate(${A.x},${A.y})`);
  return tween(D(ms), p=>g.setAttribute("transform",`translate(${A.x+(B.x-A.x)*p},${A.y+(B.y-A.y)*p})`), alive).then(()=>g.remove());
}
function hash32(str){ let h=0x811c9dc5; for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,0x01000193); } h^=h>>>16; h=Math.imul(h,0x85ebca6b); h^=h>>>13; h=Math.imul(h,0xc2b2ae35); h^=h>>>16; return h>>>0; }
function seg(items, cur, onPick){ const box=H("div",{class:"seg",role:"group"}); items.forEach(([v,l])=>box.append(H("button",{"aria-pressed":String(v===cur),onclick:e=>{ [...box.children].forEach(b=>b.setAttribute("aria-pressed","false")); e.currentTarget.setAttribute("aria-pressed","true"); onPick(v); }},l))); return box; }

const SIMS = {
/* ---------- Load balancer ---------- */
lb(){
  let alive=true; const isAlive=()=>alive;
  const panel=$("simPanel"); panel.innerHTML="";
  svg.setAttribute("viewBox","0 0 960 470"); svg.innerHTML="";
  const ALGOS={
    rr:["Round robin","Each new request goes to the next server in order: S1, S2, S3, S4, S1 and so on. It is simple and even, but blind to how busy each server is."],
    wrr:["Weighted round robin","Like round robin, but servers with more capacity get proportionally more turns. Here S1 has weight 3, S3 has 2, and S2 and S4 have 1."],
    least:["Least connections","Each request goes to the server with the fewest active connections. It adapts naturally to slow servers and requests of different sizes."],
    hash:["IP hash","The client's IP address is hashed to pick a server, so the same client always lands on the same server (sticky sessions). Watch the colours: each client sticks to one server."],
    rand:["Random","A server is picked at random. Over many requests the load evens out, but in the short term it is uneven."]
  };
  const st={algo:"rr",rate:3,slow:false,down:false,running:true,rr:0};
  const clients=[0,1,2,3,4,5].map(i=>({x:90,y:70+i*66,ip:"10.0.0."+(11+i*7),c:`var(--c${i+1})`}));
  const LB={x:430,y:235};
  const servers=[{n:"S1",w:3},{n:"S2",w:1},{n:"S3",w:2},{n:"S4",w:1}].map((s,i)=>({...s,x:800,y:80+i*103,active:0,total:0,cw:0}));
  const gE=S("g",{},svg), gN=S("g",{},svg), gP=S("g",{},svg);
  clients.forEach(c=>{ S("line",{x1:c.x,y1:c.y,x2:LB.x,y2:LB.y,class:"edge"},gE); });
  servers.forEach(s=>S("line",{x1:LB.x,y1:LB.y,x2:s.x,y2:s.y,class:"edge"},gE));
  clients.forEach(c=>{ const g=S("g",{},gN); S("circle",{cx:c.x,cy:c.y,r:16,style:`fill:${c.c}`},g); S("text",{x:c.x+24,y:c.y+4,class:"svgtext",text:c.ip},g); });
  S("text",{x:60,y:28,class:"svgtitle",text:"Clients"},gN);
  drawNode({x:LB.x,y:LB.y,label:"Load balancer",kind:"lb"},null,null,gN);
  const lbAlgo=S("text",{x:LB.x,y:LB.y+56,"text-anchor":"middle",class:"svgtext"},gN);
  const sG=servers.map(()=>S("g",{},gN));
  function drawServer(i){ const s=servers[i], g=sG[i]; g.innerHTML="";
    const down = st.down && i===1, slow = st.slow && i===2;
    const cls = down?"bad":slow?"warn":s.active>0?"active":"";
    const n=S("g",{class:"node "+cls,transform:`translate(${s.x},${s.y})`},g);
    S("rect",{x:-80,y:-38,width:160,height:76,rx:10,class:"box"},n);
    S("text",{x:-68,y:-18,class:"lbl",text:s.n},n);
    S("text",{x:68,y:-18,"text-anchor":"end",class:"tag",text: down?"HEALTH CHECK FAILED":slow?"SLOW · 4× LATENCY":(st.algo==="wrr"?"WEIGHT "+s.w:"SERVER")},n);
    for(let k=0;k<8;k++) S("rect",{x:-68+k*17,y:-4,width:13,height:12,rx:2,style:`fill:${k<s.active?"var(--accent)":"var(--line)"}`},n);
    S("text",{x:-68,y:28,class:"sub",text:`${s.active} active · ${s.total} served`},n);
  }
  servers.forEach((s,i)=>drawServer(i));
  function aliveServers(){ return servers.filter((s,i)=>!(st.down&&i===1)); }
  function pick(ci){
    const al=aliveServers(); if(!al.length) return null;
    switch(st.algo){
      case "rr": { const s=al[st.rr % al.length]; st.rr++; return s; }
      case "wrr": { const tot=al.reduce((a,s)=>a+s.w,0); let best=null; for(const s of al){ s.cw+=s.w; if(!best||s.cw>best.cw) best=s; } best.cw-=tot; return best; }
      case "least": { let m=Infinity, c=[]; for(const s of al){ if(s.active<m){ m=s.active; c=[s]; } else if(s.active===m) c.push(s); } return c[st.rr++ % c.length]; }
      case "hash": return al[hash32(clients[ci].ip) % al.length];
      default: return al[Math.floor(Math.random()*al.length)];
    }
  }
  async function request(){
    const ci=Math.floor(Math.random()*clients.length), c=clients[ci];
    await fly(gP,c,LB,"",null,600,isAlive); if(!alive) return;
    const s=pick(ci); if(!s) return;
    const g=S("g",{class:"pkt"},gP); S("circle",{r:6,style:`fill:${c.c}`},g);
    await tween(D(650),p=>g.setAttribute("transform",`translate(${LB.x+(s.x-80-LB.x)*p},${LB.y+(s.y-LB.y)*p})`),isAlive); g.remove(); if(!alive) return;
    const i=servers.indexOf(s); s.active++; drawServer(i);
    const base=1500*(0.7+Math.random()*0.6)*((st.slow&&i===2)?4:1);
    await sleep(D(base)); if(!alive) return;
    s.active=Math.max(0,s.active-1); s.total++; drawServer(i);
  }
  let timer=null;
  function schedule(){ clearTimeout(timer); if(!alive||!st.running) return; timer=setTimeout(()=>{ request(); schedule(); }, (1000/st.rate)/Stage.speed); }
  const explain=H("p",{class:"sim-explain"}), tip=H("p",{class:"sim-tip"});
  function setAlgo(a){ st.algo=a; st.rr=0; servers.forEach(s=>s.cw=0); explain.innerHTML=`<b>${ALGOS[a][0]}.</b> ${esc(ALGOS[a][1])}`; lbAlgo.textContent="algorithm: "+ALGOS[a][0].toLowerCase(); servers.forEach((s,i)=>drawServer(i)); }
  tip.innerHTML="<b>Try this:</b> turn on <i>S3 is slow</i>, then compare round robin with least connections. Round robin keeps sending S3 its full share and its queue grows; least connections routes around it. Then take S2 offline with IP hash and watch clients get remapped.";
  const rate=H("input",{type:"range",id:"lbRate",min:"1",max:"8",step:"1",value:"3"}); const rateL=H("span",{class:"stat"},"3 req/s");
  rate.oninput=()=>{ st.rate=+rate.value; rateL.textContent=st.rate+" req/s"; schedule(); };
  const slow=H("input",{type:"checkbox",id:"lbSlow"}); slow.onchange=()=>{ st.slow=slow.checked; drawServer(2); };
  const down=H("input",{type:"checkbox",id:"lbDown"}); down.onchange=()=>{ st.down=down.checked; drawServer(1); };
  const pause=H("button",{class:"btn"},"❚❚ Pause traffic"); pause.onclick=()=>{ st.running=!st.running; pause.textContent=st.running?"❚❚ Pause traffic":"▶ Resume traffic"; schedule(); };
  const reset=H("button",{class:"btn"},"Reset counters"); reset.onclick=()=>{ servers.forEach(s=>s.total=0); servers.forEach((s,i)=>drawServer(i)); };
  panel.append(H("div",{class:"sim-row"},seg(Object.entries(ALGOS).map(([k,v])=>[k,v[0]]),"rr",setAlgo)), explain,
    H("div",{class:"sim-row"},H("label",{for:"lbRate",class:"stat"},"Traffic"),rate,rateL,H("label",{class:"chk"},slow,"S3 is slow"),H("label",{class:"chk"},down,"S2 is down"),pause,reset), tip);
  setAlgo("rr"); schedule(); request();
  return { stop(){ alive=false; clearTimeout(timer); } };
},

/* ---------- Cache ---------- */
cache(){
  let alive=true; const isAlive=()=>alive;
  const panel=$("simPanel"); panel.innerHTML="";
  svg.setAttribute("viewBox","0 0 960 470"); svg.innerHTML="";
  const CAP=4, APP={x:130,y:235}, C={x:480,y:235}, DB={x:840,y:235};
  const st={policy:"LRU",items:[],hits:0,misses:0,lat:0,clock:0,auto:false,busy:false,queue:[]};
  st.items=[{k:"user:1",freq:3,t:1,ins:1},{k:"user:2",freq:1,t:2,ins:2}]; st.clock=2;
  const gE=S("g",{},svg), gN=S("g",{},svg), gC=S("g",{},svg), gP=S("g",{},svg);
  S("line",{x1:APP.x,y1:APP.y,x2:C.x-120,y2:C.y,class:"edge"},gE);
  S("path",{d:`M${APP.x} ${APP.y+30} C ${APP.x} 430, ${DB.x} 430, ${DB.x} ${DB.y+30}`,class:"edge",fill:"none"},gE);
  drawNode({x:APP.x,y:APP.y,label:"App server",kind:"server"},null,null,gN);
  drawNode({x:DB.x,y:DB.y,label:"Database",sub:"~40 ms per query",kind:"db"},null,null,gN);
  S("text",{x:(APP.x+DB.x)/2,y:418,"text-anchor":"middle",class:"svgtext",text:"cache miss path → database"},gN);
  const slotY=i=>C.y-105+i*58;
  function drawCache(flash){ gC.innerHTML="";
    const n=S("g",{class:"node"},gC); S("rect",{x:C.x-120,y:C.y-160,width:240,height:320,rx:12,class:"box"},n);
    S("text",{x:C.x-106,y:C.y-138,class:"tag",text:`CACHE · ${CAP} SLOTS · ${st.policy}`},n);
    S("text",{x:C.x+106,y:C.y-138,"text-anchor":"end",class:"tag",text:"~1 ms"},n);
    const order=ordered();
    for(let i=0;i<CAP;i++){ const it=order[i];
      const cls="slot"+(it&&flash&&flash.k===it.k?" "+flash.c:"");
      S("rect",{x:C.x-104,y:slotY(i)-22,width:208,height:46,rx:8,class:cls},gC);
      if(it){ S("text",{x:C.x-90,y:slotY(i)+5,class:"lbl",style:"font-family:var(--mono);font-size:14px",text:it.k},gC);
        S("text",{x:C.x+92,y:slotY(i)+5,"text-anchor":"end",class:"svgtext",text: st.policy==="LFU"?`used ${it.freq}×`:st.policy==="FIFO"?`added #${it.ins}`:(i===0?"most recent":i===order.length-1?"least recent":"")},gC); }
      else S("text",{x:C.x,y:slotY(i)+5,"text-anchor":"middle",class:"svgtext",text:"empty"},gC);
    }
    const hint=st.policy==="LRU"?"evicts the bottom (least recently used)":st.policy==="LFU"?"evicts the least frequently used":"evicts the oldest inserted";
    S("text",{x:C.x,y:C.y+150,"text-anchor":"middle",class:"svgtext",text:hint},gC);
  }
  function ordered(){ const a=[...st.items];
    if(st.policy==="LRU") a.sort((x,y)=>y.t-x.t); else if(st.policy==="LFU") a.sort((x,y)=>y.freq-x.freq||y.t-x.t); else a.sort((x,y)=>y.ins-x.ins);
    return a; }
  function victim(){ const o=ordered(); return o[o.length-1]; }
  const stats=H("div",{class:"stat"}), log=H("ul",{class:"log"});
  function renderStats(){ const n=st.hits+st.misses; stats.innerHTML=`hits <b>${st.hits}</b> · misses <b>${st.misses}</b> · hit ratio <b>${n?Math.round(st.hits/n*100):0}%</b> · avg latency <b>${n?(st.lat/n).toFixed(1):"0.0"} ms</b>`; }
  function addLog(t){ log.prepend(H("li",null,t)); while(log.children.length>5) log.lastChild.remove(); }
  const CE={x:C.x-120,y:C.y};
  async function get(key){
    await fly(gP,APP,CE,"","GET "+key,700,isAlive); if(!alive) return;
    const it=st.items.find(i=>i.k===key); st.clock++;
    if(it){ it.t=st.clock; it.freq++; drawCache({k:key,c:"hit"}); st.hits++; st.lat+=1; addLog(`HIT  ${key} → served from memory in 1 ms`);
      await fly(gP,CE,APP,"r","HIT · 1 ms",600,isAlive); }
    else {
      await fly(gP,CE,APP,"x","MISS",500,isAlive); if(!alive) return;
      await fly(gP,{x:APP.x,y:APP.y+30},{x:DB.x,y:DB.y+30},"","SELECT "+key,900,isAlive); if(!alive) return;
      await fly(gP,{x:DB.x,y:DB.y+30},{x:APP.x,y:APP.y+30},"r","row · 40 ms",900,isAlive); if(!alive) return;
      if(st.items.length>=CAP){ const v=victim(); drawCache({k:v.k,c:"evict"}); addLog(`EVICT ${v.k} (${st.policy==="LRU"?"least recently used":st.policy==="LFU"?"least frequently used":"oldest inserted"})`); await sleep(D(700)); if(!alive) return; st.items=st.items.filter(i=>i!==v); drawCache(); }
      await fly(gP,APP,CE,"","SET "+key,600,isAlive); if(!alive) return;
      st.items.push({k:key,freq:1,t:st.clock,ins:st.clock}); drawCache({k:key,c:"new"}); st.misses++; st.lat+=41; addLog(`MISS ${key} → loaded from DB and cached (41 ms)`);
    }
    renderStats();
  }
  async function update(key){
    await fly(gP,{x:APP.x,y:APP.y+30},{x:DB.x,y:DB.y+30},"","UPDATE "+key,900,isAlive); if(!alive) return;
    await fly(gP,APP,CE,"x","DEL "+key,600,isAlive); if(!alive) return;
    const had=st.items.some(i=>i.k===key); st.items=st.items.filter(i=>i.k!==key); drawCache();
    addLog(had?`WRITE ${key}: DB updated, cache entry deleted so the next read loads fresh data`:`WRITE ${key}: DB updated (it was not cached)`);
  }
  async function pump(){ if(st.busy) return; st.busy=true; while(alive && st.queue.length){ const job=st.queue.shift(); await job(); } st.busy=false; }
  const KEYS=["user:1","user:2","user:3","user:4","user:5","user:6","user:7","user:8"], W=[30,20,13,10,8,7,6,6];
  function randKey(){ let r=Math.random()*W.reduce((a,b)=>a+b); for(let i=0;i<KEYS.length;i++){ r-=W[i]; if(r<=0) return KEYS[i]; } return KEYS[0]; }
  let timer=setInterval(()=>{ if(alive && st.auto && !st.busy && !st.queue.length){ const k=randKey(); st.queue.push(()=>get(k)); pump(); } }, 300);
  const keyRow=H("div",{class:"sim-row"},H("span",{class:"stat"},"Request:"),...KEYS.map(k=>H("button",{class:"keybtn",onclick:()=>{ st.queue.push(()=>get(k)); pump(); }},k)));
  const auto=H("input",{type:"checkbox",id:"cacheAuto"}); auto.onchange=()=>{ st.auto=auto.checked; };
  const upd=H("button",{class:"btn"},"Update user:1 in the database"); upd.onclick=()=>{ st.queue.push(()=>update("user:1")); pump(); };
  const reset=H("button",{class:"btn"},"Reset"); reset.onclick=()=>{ st.queue=[]; st.items=[]; st.hits=st.misses=st.lat=0; drawCache(); renderStats(); log.innerHTML=""; };
  panel.append(
    H("p",{class:"sim-explain",html:"<b>Cache-aside.</b> The app checks the cache first. On a hit it's done in about 1 ms. On a miss it queries the database (about 40 ms), stores the result in the cache, and evicts an entry if the cache is full."}),
    keyRow,
    H("div",{class:"sim-row"},H("span",{class:"stat"},"Eviction:"),seg([["LRU","LRU"],["LFU","LFU"],["FIFO","FIFO"]],"LRU",v=>{ st.policy=v; drawCache(); }),H("label",{class:"chk"},auto,"Live traffic (popular keys requested more often)"),upd,reset),
    stats, log,
    H("p",{class:"sim-tip",html:"<b>Try this:</b> turn on live traffic and let it run for a minute under each policy. user:1 and user:2 are the hot keys. LRU and LFU keep them cached and the hit ratio climbs; FIFO evicts them regardless of popularity."}));
  drawCache(); renderStats(); addLog("Cache warmed with user:1 and user:2");
  return { stop(){ alive=false; clearInterval(timer); } };
},

/* ---------- Consistent hashing ---------- */
ring(){
  const panel=$("simPanel"); panel.innerHTML="";
  svg.setAttribute("viewBox","0 0 960 470"); svg.innerHTML="";
  const CX=290, CY=235, R=180, NAMES=["A","B","C","D","E","F"];
  const col=n=>`var(--c${NAMES.indexOf(n)+1})`;
  const st={servers:["A","B","C"],v:1,owners:{},moved:new Set()};
  const KEYS=Array.from({length:36},(_,i)=>"user:"+(i*37+101));
  const ang=h=>h/4294967296*360;
  const pt=(a,r)=>({x:CX+r*Math.sin(a*Math.PI/180),y:CY-r*Math.cos(a*Math.PI/180)});
  function points(list,v){ const p=[]; for(const s of list) for(let i=0;i<v;i++) p.push({s,a:ang(hash32(s+"#vn"+i)),lab:v>1?s+(i+1):s}); return p.sort((x,y)=>x.a-y.a); }
  function owner(key,pts){ const a=ang(hash32(key)); for(const p of pts) if(p.a>=a) return p.s; return pts[0].s; }
  function ownersFor(list,v){ const pts=points(list,v); return Object.fromEntries(KEYS.map(k=>[k,owner(k,pts)])); }
  const modOwner=(k,list)=>list[hash32(k)%list.length];
  st.owners=ownersFor(st.servers,st.v);
  const gRing=S("g",{},svg), gKeys=S("g",{},svg), gSrv=S("g",{},svg), gSide=S("g",{},svg);
  const dots={};
  KEYS.forEach(k=>{ const p=pt(ang(hash32(k)),R-30); dots[k]=S("circle",{cx:p.x,cy:p.y,r:6,class:"kdot"},gKeys); S("title",{text:k},dots[k]); });
  function arc(a1,a2,r){ let d=a2-a1; if(d<=0) d+=360; const p1=pt(a1,r),p2=pt(a1+d,r); return `M${p1.x} ${p1.y} A${r} ${r} 0 ${d>180?1:0} 1 ${p2.x} ${p2.y}`; }
  function draw(){
    const pts=points(st.servers,st.v);
    gRing.innerHTML=""; S("circle",{cx:CX,cy:CY,r:R,class:"ring"},gRing);
    pts.forEach((p,i)=>{ const prev=pts[(i-1+pts.length)%pts.length]; S("path",{d:arc(prev.a,p.a,R),fill:"none",style:`stroke:${col(p.s)};stroke-width:10;opacity:.55`},gRing); });
    S("text",{x:CX,y:CY-6,"text-anchor":"middle",class:"svgtitle",text:"hash ring"},gRing);
    S("text",{x:CX,y:CY+14,"text-anchor":"middle",class:"svgtext",text:"0 … 2³² − 1, clockwise"},gRing);
    gSrv.innerHTML="";
    pts.forEach(p=>{ const q=pt(p.a,R), lq=pt(p.a,R+26); S("circle",{cx:q.x,cy:q.y,r:st.v>1?8:12,style:`fill:${col(p.s)};stroke:var(--surface);stroke-width:3`},gSrv); S("text",{x:lq.x,y:lq.y+4,"text-anchor":"middle",class:"svgtitle",style:"font-size:12px",text:p.lab},gSrv); });
    KEYS.forEach(k=>{ dots[k].style.fill=col(st.owners[k]); dots[k].classList.toggle("moved",st.moved.has(k)); dots[k].setAttribute("r",st.moved.has(k)?8:6); });
    gSide.innerHTML="";
    S("text",{x:560,y:60,class:"svgtitle",text:"Keys per server"},gSide);
    const counts=Object.fromEntries(st.servers.map(s=>[s,0])); KEYS.forEach(k=>counts[st.owners[k]]++); const maxC=Math.max(...Object.values(counts),1);
    st.servers.forEach((s,i)=>{ const y=88+i*40; S("rect",{x:560,y:y-12,width:16,height:16,rx:3,style:`fill:${col(s)}`},gSide); S("text",{x:584,y:y+1,class:"svgtitle",text:"Server "+s},gSide);
      S("rect",{x:680,y:y-10,width:220,height:12,rx:3,style:"fill:var(--line)"},gSide); S("rect",{x:680,y:y-10,width:220*counts[s]/maxC,height:12,rx:3,style:`fill:${col(s)}`},gSide);
      S("text",{x:910,y:y+1,"text-anchor":"end",class:"svgtext",text:String(counts[s])},gSide); });
    S("text",{x:560,y:88+st.servers.length*40+10,class:"svgtext",text:`ideal: ${(KEYS.length/st.servers.length).toFixed(1)} keys each`},gSide);
  }
  const result=H("p",{class:"sim-explain"});
  function change(newList,newV,what){ const vnodeChange = newV!==st.v;
    const before=st.owners, after=ownersFor(newList,newV);
    const moved=KEYS.filter(k=>before[k]!==after[k]);
    const modMoved=KEYS.filter(k=>modOwner(k,st.servers)!==modOwner(k,newList)).length;
    st.servers=newList; st.v=newV; st.owners=after; st.moved=new Set(moved); draw(); renderChips();
    const pct=n=>Math.round(n/KEYS.length*100)+"%";
    result.innerHTML = vnodeChange
      ? `<b>${esc(what)}.</b> ${moved.length} keys changed owner. With more points per server, each server owns many small arcs instead of one big one, so the load evens out (compare the bars).`
      : `<b>${esc(what)}.</b> Consistent hashing moved <b>${moved.length} of ${KEYS.length}</b> keys (${pct(moved.length)}), highlighted on the ring. With <code>hash(key) % N</code>, <b>${modMoved}</b> keys (${pct(modMoved)}) would have moved.`;
    setTimeout(()=>{ st.moved=new Set(); draw(); }, 2600/Stage.speed);
  }
  const chips=H("div",{class:"sim-row"});
  function renderChips(){ chips.innerHTML="";
    chips.append(H("span",{class:"stat"},"Servers:"));
    st.servers.forEach(s=>chips.append(H("button",{class:"keybtn",title:"Remove server "+s,disabled:st.servers.length<=2?"disabled":null,onclick:()=>{ if(st.servers.length>2) change(st.servers.filter(x=>x!==s),st.v,"Removed server "+s); }},`${s} ✕`)));
    const next=NAMES.find(n=>!st.servers.includes(n));
    if(next) chips.append(H("button",{class:"btn",onclick:()=>change([...st.servers,next],st.v,"Added server "+next)},"+ Add server "+next));
  }
  panel.append(
    H("p",{class:"sim-explain",html:"<b>How it works.</b> Each server is hashed to a point on the ring, and so is each key. A key belongs to the first server found going <i>clockwise</i> from it. The coloured arcs show which part of the ring each server owns."}),
    chips,
    H("div",{class:"sim-row"},H("span",{class:"stat"},"Points per server:"),seg([[1,"1 (no virtual nodes)"],[4,"4 virtual nodes"]],1,v=>change([...st.servers],v,"Virtual nodes set to "+v+" per server"))),
    result,
    H("p",{class:"sim-tip",html:"<b>Try this:</b> add server D and count the highlighted keys: they all come from D's clockwise neighbour. Then remove a server; only its keys move to the next server. Turn on virtual nodes to see the uneven bars even out."}));
  result.innerHTML="<b>Start here:</b> three servers and 36 keys. Hover a dot to see its key.";
  draw(); renderChips();
  return { stop(){} };
}
};

/* ======================= LIBRARY ======================= */
let DATA=null, GUIDE={}, CAT={}, SAFE={};
const safe = id => id.toLowerCase().replace(/[^a-z0-9-]/g,"");
function renderProgress(){
  const total=DATA?DATA.guides.length:400;
  $("progress").innerHTML=`<span>Lessons <b>${lessonsDone.size}/${LESSONS.length}</b></span><span>Guides learned <b>${learned.size}/${total}</b></span>`;
  const io=H("span",{class:"io"},
    H("button",{class:"btn",title:"Save your progress to a JSON file",onclick:exportProgress},"Export progress"),
    H("button",{class:"btn",title:"Load progress from a JSON file",onclick:()=>$("importFile").click()},"Import"));
  $("progress").append(io);
}
function catChips(active){
  const box=$("catChips"); box.innerHTML="";
  box.append(H("a",{href:"#library","aria-current":active?"false":"page"},"All",H("small",null,DATA.guides.length)));
  for(const c of DATA.categories){ const n=DATA.guides.filter(g=>g.categories.includes(c.id)).length;
    box.append(H("a",{href:"#library-"+c.id,"aria-current":active===c.id?"page":"false"},c.title,H("small",null,n))); }
}
function guideRow(g){
  const ls=LESSON_BY_GUIDE[g.id];
  return H("a",{class:"grow",href:"#g-"+safe(g.id)},H("span",{class:"ck","aria-label":learned.has(g.id)?"Learned":""},learned.has(g.id)?"✓":""),
    H("span",null,H("div",{class:"t"},g.title),H("div",{class:"d"},g.description||""),ls?H("span",{class:"badge"},"▶ animated lesson"):null,g.custom?H("span",{class:"badge new"},"MERN+ guide"):null));
}
let libCat=null;
function renderLibrary(){
  const q=$("q").value.trim().toLowerCase(), hide=$("hideLearned").checked, body=$("libBody"); body.innerHTML="";
  catChips(libCat);
  let list=DATA.guides.filter(g=>(!libCat||g.categories.includes(libCat))&&(!hide||!learned.has(g.id)));
  if(q){ const terms=q.split(/\s+/);
    list=list.map(g=>{ let sc=0; for(const t of terms){ const inT=g._t.includes(t), inD=g._d.includes(t), inB=g._b.includes(t); if(!inT&&!inD&&!inB) return null; sc+=(inT?10:0)+(inD?4:0)+(inB?1:0); } return [sc,g]; }).filter(Boolean).sort((a,b)=>b[0]-a[0]).map(x=>x[1]);
    $("libSub").textContent=`${list.length} guide${list.length===1?"":"s"} match “${q}”.`;
    if(!list.length){ body.append(H("p",{class:"empty"},"No guides match. Try a shorter or different term, such as “cache” or “auth”.")); return; }
    const gl=H("div",{class:"glist"}); list.forEach(g=>gl.append(guideRow(g))); body.append(gl); return; }
  const cats = libCat ? DATA.categories.filter(c=>c.id===libCat) : DATA.categories;
  $("libSub").textContent = libCat ? (CAT[libCat].description||"") : `${DATA.guides.length} guides in ${DATA.categories.length} categories. Guides marked ▶ have an animated lesson.`;
  for(const c of cats){
    const gs = list.filter(g => libCat ? true : g.categories[0]===c.id); if(!gs.length) continue;
    const all=DATA.guides.filter(g=>g.categories.includes(c.id)), done=all.filter(g=>learned.has(g.id)).length;
    const sec=H("section",{class:"cat-sec"},
      H("h2",null,c.title,H("small",null,`${done}/${all.length} learned `),H("span",{class:"bar"},H("i",{style:`width:${all.length?done/all.length*100:0}%`}))),
      libCat?null:H("p",{class:"cdesc"},c.description||""));
    const ls=CAT_LESSONS[c.id]; if(ls) sec.append(H("p",{class:"cdesc"},"Animated lessons: ",...ls.flatMap((id,i)=>[i?", ":"",H("a",{href:"#lab-"+id},LESSON_MAP[id].title)])));
    const gl=H("div",{class:"glist"}); gs.forEach(g=>gl.append(guideRow(g))); sec.append(gl); body.append(sec);
  }
}
$("q").addEventListener("input",()=>{ if(DATA) renderLibrary(); });
$("hideLearned").addEventListener("change",()=>{ if(DATA) renderLibrary(); });

function renderMarkdown(md){
  let html;
  try{ html = window.marked ? marked.parse(md) : md.split(/\n{2,}/).map(p=>`<p>${esc(p)}</p>`).join(""); }catch(e){ html=`<p>${esc(md)}</p>`; }
  const div=document.createElement("div"); div.innerHTML=html;
  div.querySelectorAll("script,iframe,object,embed,style,form").forEach(n=>n.remove());
  div.querySelectorAll("*").forEach(n=>{ [...n.attributes].forEach(a=>{ if(/^on/i.test(a.name)||(/^(href|src)$/i.test(a.name)&&/^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name); }); });
  div.querySelectorAll("a[href]").forEach(a=>{ a.target="_blank"; a.rel="noopener"; });
  return div;
}
function showGuide(sid){
  const id=SAFE[sid], g=GUIDE[id], box=$("viewGuide"); box.innerHTML="";
  if(!g){ box.append(H("p",{class:"empty"},"That guide wasn't found. ",H("a",{href:"#library"},"Back to the library"))); return; }
  const primary=g.categories[0], pc=CAT[primary];
  const siblings=DATA.guides.filter(x=>x.categories.includes(primary)), idx=siblings.indexOf(g);
  const prev=siblings[idx-1], next=siblings[idx+1];
  const ls=LESSON_BY_GUIDE[g.id], fallback=(CAT_LESSONS[primary]||[]);
  const learnBtn=H("button",{class:"btn learn-btn","aria-pressed":String(learned.has(g.id))},learned.has(g.id)?"✓ Learned":"Mark as learned");
  learnBtn.onclick=()=>{ if(learned.has(g.id)) learned.delete(g.id); else learned.add(g.id); saveProgress(); const on=learned.has(g.id); learnBtn.setAttribute("aria-pressed",String(on)); learnBtn.textContent=on?"✓ Learned":"Mark as learned"; };
  const main=H("article",{style:"min-width:0"},
    H("div",{class:"crumbs"},H("a",{href:"#library"},"Library")," / ",pc?H("a",{href:"#library-"+primary},pc.title):""),
    H("h1",null,g.title),
    H("div",{class:"rmeta"},g.createdAt?H("span",null,g.createdAt):null,...g.tags.slice(0,6).map(t=>H("span",{class:"tag-pill"},t))),
    ls?H("div",{class:"callout"},H("p",null,H("b",null,"Animated lesson: "),LESSON_MAP[ls[0]].title),H("a",{class:"btn primary",href:"#lab-"+ls[0],style:"text-decoration:none"},"▶ Watch it")):null,
    g.image?H("img",{class:"hero-img",src:g.image,alt:"Diagram: "+g.title,loading:"lazy",onclick:e=>{ e.currentTarget.classList.toggle("zoom"); window.open(g.image,"_blank"); }}):null,
    H("div",{class:"prose"},g.description?H("p",null,H("em",null,g.description)):null, renderMarkdown(g.body)),
    g.custom?null:H("p",null,H("a",{href:"https://bytebytego.com/guides/"+g.id,target:"_blank",rel:"noopener"},"Open this guide on bytebytego.com ↗")));
  const side=H("aside",{class:"side"},
    H("div",{class:"card"},learnBtn),
    (ls||fallback.length)?H("div",{class:"card"},H("h3",null,"Animated lessons"),H("div",{class:"pn"},...[...new Set([...(ls||[]),...fallback])].slice(0,4).map(id=>H("a",{href:"#lab-"+id},LESSON_MAP[id].title,H("small",null,LESSON_MAP[id].group))))):null,
    H("div",{class:"card"},H("h3",null,pc?pc.title:"More"),H("div",{class:"pn"},
      prev?H("a",{href:"#g-"+safe(prev.id)},H("small",null,"← Previous"),prev.title):null,
      next?H("a",{href:"#g-"+safe(next.id)},H("small",null,"Next →"),next.title):null)));
  box.append(H("div",{class:"reader"},main,side));
  renderDiagrams(main);
  window.scrollTo(0,0);
}
/* Mermaid diagrams in ```mermaid fenced blocks (used by the custom guides). */
let mermaidReady=false;
function renderDiagrams(root){
  const blocks=[...root.querySelectorAll("pre > code.language-mermaid")]; if(!blocks.length) return;
  if(!window.mermaid){ if(document.readyState!=="complete") window.addEventListener("load",()=>renderDiagrams(root),{once:true}); return; }
  const nodes=blocks.map(code=>{ const d=document.createElement("div"); d.className="mermaid"; d.textContent=code.textContent; code.parentElement.replaceWith(d); return d; });
  const dark=document.documentElement.dataset.theme==="dark"||(document.documentElement.dataset.theme!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);
  if(!mermaidReady){ mermaid.initialize({startOnLoad:false,securityLevel:"strict",theme:dark?"dark":"neutral",fontFamily:"IBM Plex Sans, sans-serif"}); mermaidReady=true; }
  mermaid.run({nodes}).catch(e=>console.warn("mermaid:",e)).finally(()=>nodes.forEach(addZoom));
}
/* Full-screen diagram viewer: wheel/pinch to zoom, drag to pan, + − 0 Esc on the keyboard. */
function addZoom(box){
  if(!box.querySelector("svg")||box.querySelector(".mz-open")) return;
  const b=document.createElement("button"); b.type="button"; b.className="mz-open"; b.title="Open diagram full screen to zoom and pan"; b.textContent="⤢ Zoom";
  b.addEventListener("click",e=>{ e.stopPropagation(); openZoom(box); });
  box.addEventListener("dblclick",()=>openZoom(box));
  box.append(b);
}
function openZoom(box){
  const svg=box.querySelector("svg"); if(!svg) return;
  const vb=svg.viewBox&&svg.viewBox.baseVal, w=vb&&vb.width||svg.getBoundingClientRect().width, h=vb&&vb.height||svg.getBoundingClientRect().height;
  const saved={style:svg.getAttribute("style"),width:svg.getAttribute("width"),height:svg.getAttribute("height")};
  const ph=document.createComment("diagram"); svg.replaceWith(ph); // move (not clone) so the SVG's scoped ids and styles stay unique
  svg.setAttribute("style",""); svg.setAttribute("width",w); svg.setAttribute("height",h);
  const ov=document.createElement("div"); ov.className="mz"; ov.setAttribute("role","dialog"); ov.setAttribute("aria-modal","true"); ov.setAttribute("aria-label","Diagram viewer");
  ov.innerHTML='<div class="mz-bar"><button type="button" class="btn" data-z="out" title="Zoom out (−)">−</button><span class="mz-pct">100%</span><button type="button" class="btn" data-z="in" title="Zoom in (+)">+</button><button type="button" class="btn" data-z="fit" title="Fit to screen (0)">Fit</button><button type="button" class="btn" data-z="one" title="Actual size (1)">1:1</button><span class="mz-hint">Scroll or pinch to zoom · drag to pan</span><button type="button" class="btn" data-z="close" title="Close (Esc)">✕ Close</button></div><div class="mz-stage"><div class="mz-canvas"></div></div>';
  const stage=ov.querySelector(".mz-stage"), canvas=ov.querySelector(".mz-canvas"), pct=ov.querySelector(".mz-pct"); canvas.append(svg);
  let s=1,x=0,y=0; const MIN=.1,MAX=8;
  const apply=()=>{ canvas.style.transform=`translate(${x}px,${y}px) scale(${s})`; pct.textContent=Math.round(s*100)+"%"; };
  const zoomAt=(f,cx,cy)=>{ const r=stage.getBoundingClientRect(); cx??=r.width/2; cy??=r.height/2; const ns=Math.min(MAX,Math.max(MIN,s*f)); x=cx-(cx-x)*ns/s; y=cy-(cy-y)*ns/s; s=ns; apply(); };
  const fit=()=>{ const r=stage.getBoundingClientRect(); s=Math.min(MAX,Math.min(r.width/w,r.height/h)*.94); x=(r.width-w*s)/2; y=(r.height-h*s)/2; apply(); };
  const one=()=>{ const r=stage.getBoundingClientRect(); s=1; x=(r.width-w)/2; y=Math.max(16,(r.height-h)/2); apply(); };
  stage.addEventListener("wheel",e=>{ e.preventDefault(); const r=stage.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY*(e.ctrlKey?.01:.0015)),e.clientX-r.left,e.clientY-r.top); },{passive:false});
  const pts=new Map(); let last=null;
  stage.addEventListener("pointerdown",e=>{ stage.setPointerCapture(e.pointerId); pts.set(e.pointerId,{x:e.clientX,y:e.clientY}); last=null; stage.classList.add("grab"); });
  stage.addEventListener("pointermove",e=>{ if(!pts.has(e.pointerId)) return; const p=pts.get(e.pointerId); const dx=e.clientX-p.x, dy=e.clientY-p.y; pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pts.size===1){ x+=dx; y+=dy; apply(); return; }
    const [a,c]=[...pts.values()], d=Math.hypot(a.x-c.x,a.y-c.y), r=stage.getBoundingClientRect();
    if(last) zoomAt(d/last,(a.x+c.x)/2-r.left,(a.y+c.y)/2-r.top); last=d; });
  const up=e=>{ pts.delete(e.pointerId); last=null; if(!pts.size) stage.classList.remove("grab"); };
  stage.addEventListener("pointerup",up); stage.addEventListener("pointercancel",up);
  stage.addEventListener("dblclick",e=>{ const r=stage.getBoundingClientRect(); zoomAt(2,e.clientX-r.left,e.clientY-r.top); });
  const prevFocus=document.activeElement;
  const close=()=>{ document.removeEventListener("keydown",key,true); window.removeEventListener("resize",fit); window.removeEventListener("hashchange",close); ov.remove(); document.body.classList.remove("mz-lock");
    for(const k of ["style","width","height"]) saved[k]==null?svg.removeAttribute(k):svg.setAttribute(k,saved[k]); ph.replaceWith(svg); prevFocus&&prevFocus.focus&&prevFocus.focus(); };
  const key=e=>{ const k=e.key; if(k==="Escape") close(); else if(k==="+"||k==="=") zoomAt(1.25); else if(k==="-"||k==="_") zoomAt(.8); else if(k==="0") fit(); else if(k==="1") one();
    else if(k.startsWith("Arrow")){ x+=k==="ArrowLeft"?60:k==="ArrowRight"?-60:0; y+=k==="ArrowUp"?60:k==="ArrowDown"?-60:0; apply(); } else return; e.preventDefault(); e.stopPropagation(); };
  ov.querySelector(".mz-bar").addEventListener("click",e=>{ const z=e.target.closest("[data-z]"); if(!z) return; const a=z.dataset.z;
    if(a==="in") zoomAt(1.25); else if(a==="out") zoomAt(.8); else if(a==="fit") fit(); else if(a==="one") one(); else close(); });
  document.addEventListener("keydown",key,true); window.addEventListener("resize",fit); window.addEventListener("hashchange",close);
  document.body.append(ov); document.body.classList.add("mz-lock"); fit(); ov.querySelector('[data-z="close"]').focus();
}

/* ======================= ROUTER ======================= */
function setView(v){ $("viewLab").hidden=v!=="lab"; $("viewLib").hidden=v!=="lib"; $("viewGuide").hidden=v!=="guide";
  $("navLab").setAttribute("aria-current",v==="lab"?"page":"false"); $("navLib").setAttribute("aria-current",v!=="lab"?"page":"false"); }
function route(){
  const h=decodeURIComponent(location.hash.slice(1))||"lab-url";
  if(h.startsWith("lab-")){ setView("lab"); const id=h.slice(4); if(!P.L||P.L.id!==id||activeSim===null&&LESSON_MAP[id]&&LESSON_MAP[id].mode==="sim") showLesson(id); $("navLab").href="#lab-"+(P.L?P.L.id:"url"); return; }
  stopAll();
  if(h==="library"||h.startsWith("library-")){ setView("lib"); libCat=h.startsWith("library-")?h.slice(8):null; if(libCat&&DATA&&!CAT[libCat]) libCat=null; if(DATA) renderLibrary(); window.scrollTo(0,0); return; }
  if(h.startsWith("g-")){ setView("guide"); if(DATA) showGuide(h.slice(2)); else $("viewGuide").innerHTML='<p class="empty">Loading guide…</p>'; return; }
  setView("lab"); showLesson("url");
}
window.addEventListener("hashchange",()=>{ const h=location.hash; if(!h.startsWith("#lab-")) P.L=null; route(); });

renderProgress(); route();
Promise.resolve(window.ATLAS_DATA).then(d=>{ if(!d) throw new Error("data.js missing");
  DATA=d; d.guides.forEach(g=>{ GUIDE[g.id]=g; SAFE[safe(g.id)]=g.id; g._t=g.title.toLowerCase(); g._d=(g.description||"").toLowerCase()+" "+g.tags.join(" ").toLowerCase(); g._b=g.body.toLowerCase(); });
  d.categories.forEach(c=>CAT[c.id]=c);
  const n=d.guides.length; document.querySelector(".brand span").textContent=`${n} guides · ${LESSONS.length} animated lessons`; $("q").placeholder=`Search ${n} guides: mongodb, kafka, jwt, sharding…`;
  renderProgress(); renderRelated();
  const h=location.hash; if(h.startsWith("#library")||h.startsWith("#g-")) route();
}).catch(()=>{ $("libBody").innerHTML='<p class="empty">data.js was not found next to index.html. Run <code>node build-data.mjs</code> in this folder, then reload.</p>'; });

/* ======================= PROGRESS BACKUP ======================= */
function exportProgress(){
  const data={app:"system-design-atlas",exportedAt:new Date().toISOString(),learnedGuides:[...learned],completedLessons:[...lessonsDone]};
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));
  a.download="system-design-progress-"+new Date().toISOString().slice(0,10)+".json"; document.body.append(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },500);
}
$("importFile").addEventListener("change",e=>{
  const f=e.target.files[0]; if(!f) return;
  f.text().then(t=>{ const d=JSON.parse(t);
    (d.learnedGuides||[]).forEach(x=>learned.add(x)); (d.completedLessons||[]).forEach(x=>lessonsDone.add(x));
    saveProgress(); renderLessonList(); route(); e.target.value=""; })
   .catch(()=>{ alert("That file isn't a valid progress export."); e.target.value=""; });
});
