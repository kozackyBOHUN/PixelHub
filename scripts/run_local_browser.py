import sys,runpy,os
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'.test-tools'))
os.environ.setdefault('PIXELHUB_URL','http://127.0.0.1:5179/')
runpy.run_path(sys.argv[1],run_name='__main__')
