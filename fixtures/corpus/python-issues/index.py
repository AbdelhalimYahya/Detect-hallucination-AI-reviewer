import optparse

import pickle

data = {"key": "value"}
serialized = pickle.dumps(data)
unpickled = pickle.loads(data)

import subprocess
user_input = "some command"
subprocess.call(user_input, shell=True)
