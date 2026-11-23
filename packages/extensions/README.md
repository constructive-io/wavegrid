# WaveGrid brain extensions

Register a project extension with the server's extension loader. Enabled
extensions get a project store accessor and publish hook at setup. They can
authorize a connection and claim its scope, handle operator messages, contribute
state, and composite output. A scope owns its initial packets, state and message
handling; scoped sockets never fall through to the rig dispatcher. Registrations
can declare which requests must acquire their scope, so credentials cannot gain
full-rig access when the corresponding extension is disabled.
