let capsuleAdapter = null;
const helpers = require('./capsule.helpers');
module.exports = {
    type: "app",
    app: "capsule",
    methods: {
        adapter() {
            if (!capsuleAdapter) {
                const {oauth_access_token} = this.$auth;
                capsuleAdapter = helpers.getCapsuleClient(oauth_access_token);
            }
            return capsuleAdapter;
        }
    },
}
