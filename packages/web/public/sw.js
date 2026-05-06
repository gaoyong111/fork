/**
 * Service Worker - 收藏夹 PWA 离线支持
 * 策略：
 * - 静态资源：缓存优先（Cache First）
 * - API 请求：网络优先（Network First）
 */

// 缓存版本号，修改此值可强制更新所有缓存
const CACHE_NAME = 'favorites-v2';
const STATIC_CACHE = 'favorites-static-v2';
const API_CACHE = 'favorites-api-v2';

// 需要缓存的静态资源
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icons/icon.svg',
];

/**
 * 安装事件：预缓存静态资源
 */
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    // 立即激活，不等待旧 Service Worker 关闭
    self.skipWaiting();
});

/**
 * 激活事件：清理旧版本缓存
 */
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => {
                        return name !== STATIC_CACHE && name !== API_CACHE;
                    })
                    .map((name) => caches.delete(name))
            );
        })
    );
    // 立即控制所有页面
    self.clients.claim();
});

/**
 * 请求拦截：根据请求类型选择缓存策略
 */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // API 请求：网络优先
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirst(request));
        return;
    }

    // SPA 导航请求：非 API、非静态资源的导航请求，缓存未命中时回退到 /index.html
    if (request.mode === 'navigate') {
        event.respondWith(
            caches.match('/index.html').then((cached) => {
                return cached || fetch(request).then((response) => {
                    // 网络成功时缓存 index.html
                    if (response.ok) {
                        const cache = caches.open(STATIC_CACHE);
                        cache.put('/index.html', response.clone());
                    }
                    return response;
                }).catch(() => {
                    // 网络不可用且无缓存，返回离线提示
                    return new Response('离线状态，请检查网络连接', {
                        status: 503,
                        statusText: 'Service Unavailable',
                    });
                });
            })
        );
        return;
    }

    // 静态资源：缓存优先
    if (request.method === 'GET') {
        event.respondWith(cacheFirst(request));
        return;
    }
});

/**
 * 缓存优先策略（Cache First）
 * 适用于静态资源，优先从缓存读取，缓存未命中时从网络获取
 * @param request - 请求对象
 * @returns 响应对象
 */
async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) {
        return cached;
    }

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        // 网络不可用且无缓存，返回离线页面
        return new Response('离线状态，请检查网络连接', {
            status: 503,
            statusText: 'Service Unavailable',
        });
    }
}

/**
 * 网络优先策略（Network First）
 * 适用于 API 请求，优先从网络获取，网络不可用时回退到缓存
 * @param request - 请求对象
 * @returns 响应对象
 */
async function networkFirst(request) {
    try {
        const response = await fetch(request);
        if (response.ok && request.method === 'GET') {
            const cache = await caches.open(API_CACHE);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        const cached = await caches.match(request);
        if (cached) {
            return cached;
        }

        return new Response(
            JSON.stringify({ code: -1, message: '网络不可用' }),
            {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
            }
        );
    }
}
