const version = "0.1.2";
const helpers = require('./capsule.helpers');
const capsuleApp = require('./capsule.app');

module.exports = {
    key: 'capsulecrm-capsule-opportunity-hook',
    name: "capsule-opportunity-hook",
    version: version,
    description: "Creates a Capsule CRM Webhook",
    hooks: {
        async deploy() {
            await helpers.deployHook(
                this.capsule.adapter(),
                {
                    capsuleEvent: this.event,
                    targetUrl: this.http.endpoint,
                    onSet: (newRestHook) => this.db.set('restHook', newRestHook),
                }
            );
        },
        async activate() {
            await helpers.activateHook(
                this.capsule.adapter(),
                {
                    restHook: this.db.get('restHook'),
                    capsuleEvent: this.event,
                    targetUrl: this.http.endpoint,
                    onSet: (newRestHook) => this.db.set('restHook', newRestHook),
                }
            );
        },
        async deactivate() {
            const restHook = this.db.get('restHook');
            if (restHook) {
                await helpers.deactivateHook(
                    this.capsule.adapter(),
                    {
                        hookId: restHook.id,
                        onClear: () => this.db.set('restHook', null)
                    }
                );
            }
        },
    },
    props: {
        db: "$.service.db",
        http: {
            type: "$.interface.http",
            customResponse: true
        },
        capsule: capsuleApp,
        event: {
            description: "Hook Event",
            type: "string",
            options: [
                helpers.CAPSULE_EVENTS.OPPORTUNITY_CREATED,
                helpers.CAPSULE_EVENTS.OPPORTUNITY_UPDATED,
                helpers.CAPSULE_EVENTS.OPPORTUNITY_CLOSED,
                helpers.CAPSULE_EVENTS.OPPORTUNITY_DELETED,
            ],
        },
        milestoneFilter: {
            description: "Current milestone",
            type: "integer",
            optional: true,
            options() {
                return this.capsule.adapter().milestoneOptions();
            },
        },
        previousMilestoneFilter: {
            description: "Previous milestone",
            type: "integer",
            optional: true,
            options() {
                return this.capsule.adapter().milestoneOptions();
            },
        },
        tagFilter: {
            description: "Tag or DataTag",
            type: "integer",
            optional: true,
            options() {
                return this.capsule.adapter().opportunityTagOptions();
            },
        },
    },
    async run(pipedreamEvent) {
        const expectedEvent = this.event;
        const {body} = pipedreamEvent;
        if (body.event === expectedEvent) {
            const errors = [];
            const adapter = this.capsule.adapter();
            const matchingItems = await helpers.getMatchingCapsuleItems(body.payload || [], this.getFilters());
            await Promise.all(matchingItems.map(capsuleItem => adapter
                .getOpportunity(capsuleItem.id)
                .then(opportunity => this.$emit({event: this.event, item: capsuleItem, opportunity}))
                .catch(error => {
                    console.error('Failed to get opportunity', capsuleItem.id, error)
                    errors.push({opportunityId: capsuleItem.id, error: error.message});
                    this.$emit({event: this.event, item: capsuleItem});
                })
            ));
            this.http.respond({
                status: 200,
                body: JSON.stringify({
                    message: `Matching items: ${matchingItems.length}`,
                    errors,
                })
            });
        } else {
            this.http.respond({
                status: 400,
                body: `Expected ${expectedEvent} event. Received ${body.event}`
            });
        }
    },
    methods: {
        getFilters() {
            return [
                {
                    name: 'tagFilter',
                    matches: (item) => this.tagFilter > 0
                        ? (this.capsule.adapter().getOpportunityTags(item.id).then(tags => tags.some(tag => tag.id === this.tagFilter)))
                        : true,
                },
                {
                    name: 'milestoneFilter',
                    matches: (item) => this.milestoneFilter > 0
                        ? (item.milestone && item.milestone.id === this.milestoneFilter)
                        : true,
                },
                {
                    name: 'previousMilestoneFilter',
                    matches:
                        (item) => this.previousMilestoneFilter > 0
                            ? (item.lastOpenMilestone && item.lastOpenMilestone.id === this.previousMilestoneFilter)
                            : true,
                },
            ];
        }
    }
};
