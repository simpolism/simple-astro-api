cmd_Release/obj.target/sweph/src/sweph.o := g++ -o Release/obj.target/sweph/src/sweph.o ../src/sweph.cpp '-DNODE_GYP_MODULE_NAME=sweph' '-DUSING_UV_SHARED=1' '-DUSING_V8_SHARED=1' '-DV8_DEPRECATION_WARNINGS=1' '-D_LARGEFILE_SOURCE' '-D_FILE_OFFSET_BITS=64' '-DNAPI_DISABLE_CPP_EXCEPTIONS' '-DBUILDING_NODE_EXTENSION' -I/usr/include/nodejs/include/node -I/usr/include/nodejs/src -I/usr/include/nodejs/deps/openssl/config -I/usr/include/nodejs/deps/openssl/openssl/include -I/usr/include/nodejs/deps/uv/include -I/usr/include/nodejs/deps/zlib -I/usr/include/nodejs/deps/v8/include -I../../node-addon-api -I../src -I../swisseph  -fPIC -pthread -Wall -Wextra -Wno-unused-parameter -m64 -fPIC -O3 -fno-omit-frame-pointer -fno-rtti -fno-exceptions -std=gnu++1y -MMD -MF ./Release/.deps/Release/obj.target/sweph/src/sweph.o.d.raw   -c
Release/obj.target/sweph/src/sweph.o: ../src/sweph.cpp ../src/sweph.h \
 ../../node-addon-api/napi.h /usr/include/nodejs/src/node_api.h \
 /usr/include/nodejs/src/node_api_types.h ../../node-addon-api/napi-inl.h \
 ../../node-addon-api/napi.h ../../node-addon-api/napi-inl.deprecated.h \
 ../swisseph/swephexp.h ../swisseph/sweodef.h
../src/sweph.cpp:
../src/sweph.h:
../../node-addon-api/napi.h:
/usr/include/nodejs/src/node_api.h:
/usr/include/nodejs/src/node_api_types.h:
../../node-addon-api/napi-inl.h:
../../node-addon-api/napi.h:
../../node-addon-api/napi-inl.deprecated.h:
../swisseph/swephexp.h:
../swisseph/sweodef.h:
