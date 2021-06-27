module.exports.CAPSULE_EVENTS = Object.freeze({
    PARTY_CREATED: 'party/created',
    PARTY_UPDATED: 'party/updated',
    PARTY_DELETED: 'party/deleted',
    KASE_CREATED: 'kase/created',
    KASE_UPDATED: 'kase/updated',
    KASE_DELETED: 'kase/deleted',
    KASE_CLOSED: 'kase/closed',
    OPPORTUNITY_CREATED: 'opportunity/created',
    OPPORTUNITY_UPDATED: 'opportunity/updated',
    OPPORTUNITY_DELETED: 'opportunity/deleted',
    OPPORTUNITY_CLOSED: 'opportunity/closed',
    TASK_CREATED: 'task/created',
    TASK_UPDATED: 'task/updated',
    TASK_COMPLETED: 'task/completed',
    USER_CREATED: 'user/created',
    USER_UPDATED: 'user/updated',
    USER_DELETED: 'user/deleted',
});

module.exports.getCapsuleClient = function (token, apiVersion = 'v2') {
    const baseApiUrl = `https://api.capsulecrm.com/api/${apiVersion}`;
    const axios = require('axios');
    const _store = {};
    const cache = (key, resolver) => {
        return _store[key]
            ? _store[key]
            : (_store[key] = Promise.resolve(resolver()));
    }
    const ax = axios.create({
        baseURL: baseApiUrl,
        timeout: 1000,
        get headers() {
            return {'Authorization': `Bearer ${token}`}
        }
    });
    // ax.interceptors.request.use(request => {
    //     console.log('Starting Request url', request.url);
    //     console.log('Starting Request params', request.params);
    //     return request
    // })
    //
    // ax.interceptors.response.use(response => {
    //     console.log('Starting response url', response.url);
    //     console.log('Starting response', response.data);
    //     return response
    // })

    return {
        baseApiUrl,
        async get(path, params, opts = {}) {
            if (params) {
                opts.params = params;
            }
            const {data} = await ax.get(path, opts);
            return data;
        },
        async delete(path, data) {
            const response = await ax.delete(path, data);
            return response.data;
        },
        async post(path, data) {
            const response = await ax.post(path, data);
            return response.data;
        },
        async createHook(event, targetUrl) {
            console.log(`creating hook`, {event, targetUrl});
            const date = new Date().toISOString();
            const {restHook} = await this.post('resthooks', {
                "restHook": {
                    event,
                    targetUrl,
                    "description": `Subscription to pipedream v${date}`
                }
            });
            return restHook;
        },
        async deleteHook(hookId) {
            console.log(`deleting hook`, {hookId});
            try {
                await this.delete(`resthooks/${hookId}`);
            } catch (error) {
                if (error.response && error.response.status === 404)
                    return true;
                throw error;
            }
            return true;
        },
        listOpportunityTags() {
            return cache(
                'listOpportunityTags',
                () => this.get('opportunities/tags').then(({tags}) => tags)
            );
        },
        opportunityTagOptions() {
            return this.listOpportunityTags().then(tags => {
                console.log('tags', tags);
                return [{value: 0, label: 'Any Tag'}]
                    .concat(tags.map(tag => ({
                        value: tag.id,
                        label: tag.name
                    })));
            });
        },
        getOpportunity(opportunityId) {
            return this.get(`opportunities/${opportunityId}`, {
                embed: 'fields,tags'
            }).then(({opportunity}) => opportunity);
        },
        getOpportunityTags(opportunityId) {
            return this.get(`opportunities/${opportunityId}`, {
                embed: 'tags'
            })
                .then(({opportunity}) => (opportunity.tags || []));
        },
        listMilestones() {
            return cache(
                'listMilestones',
                () => this.get('milestones').then(({milestones}) => milestones)
            );
        },
        milestoneOptions() {
            return this.listMilestones().then(milestones => {
                return [{value: 0, label: 'Any Milestone'}]
                    .concat(milestones.map(milestone => ({
                        value: milestone.id,
                        label: milestone.name
                    })));
            });
        }
    };
}
module.exports.activateHook = async function (adapter, {restHook, capsuleEvent, targetUrl, onSet}) {
    if (!restHook) {
        const newRestHook = await adapter.createHook(capsuleEvent, targetUrl);
        onSet(newRestHook);
    } else {
        if (restHook && restHook.event !== capsuleEvent) {
            await adapter.deleteHook(restHook.id);
            const newRestHook = await adapter.createHook(capsuleEvent, targetUrl);
            onSet(newRestHook);
        }
    }
}
module.exports.deployHook = async function (adapter, {capsuleEvent, targetUrl, onSet}) {
    const restHook = await adapter.createHook(capsuleEvent, targetUrl);
    onSet(restHook);
}

module.exports.deactivateHook = async function (adapter, {hookId, onClear}) {
    const restHook = await adapter.deleteHook(hookId);
    onClear(restHook);
}

module.exports.getMatchingCapsuleItems = async (capsuleItems, capsuleItemFilters) => {
    const matches = [];
    await Promise.all((capsuleItems || []).map(async (item) => {
            let isMatch = true;
            for (const filter of capsuleItemFilters) {
                if (typeof filter === 'function')
                    isMatch = await Promise.resolve(filter(item));
                else {
                    isMatch = await Promise.resolve(filter.matches(item));
                    // if (!isMatch)
                    //     console.log('filter not matched - ' + filter.name);
                }
                if (!isMatch) break;
            }
            isMatch && matches.push(item);
        }
    ));
    return matches;
}
